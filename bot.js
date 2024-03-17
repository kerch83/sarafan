import pkg from './package.json' assert { type: "json" };
import TelegramBot from 'node-telegram-bot-api';
import nominatim from 'nominatim-client';
import md5 from 'md5';
const client = nominatim.createClient({
  useragent: "sarafan",             // The name of your application
  referer: 'http://srfn.su',  // The referer link
});
class Bot {
  tagLists = {};
  constructor() { }
  async init(token, db, i18n, tags) {
    this.nominatim = client;
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db.gun;
    this.DB = db;
    this.i18n = i18n;
    this.tags = this.parseString(tags);
    console.log("this.tags", this.tags, tags);
    this.startTag = await this.DB.addTags(this.tags.tags);
    console.log("start bot ver", pkg.version.toString(), this.startTag);
  }
  async addTagBase(parent, arr) {//TODO добавлять не только текст.
    //фото видео. события(добавить дату начала/конца). задачи(то попозжее)?
    this.DB.addTag(parent, arr);
    //this.DB.printTags();
    return;
  }
  async addTag(u, arr) {
    //const user = await this.DB.getUser(u.id);
    const user = await this.getUserOrCreate(u);
    //console.log("user", user.toJSON());
    //const child = await this.addTagBase(parent, arr);
    const newTag = await this.DB.addTag(user.nowtag, arr);
    await user.incrementalPatch({nowtag: newTag.id});
    //this.touch(parent);
    await this.editTagMessage(u);
    return newTag;
  }
  async editTagMessage(user) {
    const u = await this.getUserOrCreate(user);
    //const u = await this.DB.getUser(user?.id);//this.db.get("users").get(user).then();
    if (!u) return;
    //console.log("editMessage", user.id, u?.name, u?.toJSON());
    const t = await this.DB.getTag(u.nowtag);//await this.db.get("users").get(user).get("nowtag").then();
    const text = await this.tagText(t);
    const treeTags = await this.DB.getTagChilds(t?.id);
    const keyboard = await this.keyboard(t ? "tags" : "root", treeTags, u.state);
    //console.log("editTagMessage", u.id, u.message_id, text, keyboard);
    if (!u.message_id) {//нечего исправлять, отправляем
      await this.onTags(user);
      return;
    }
    try {
      const ret = await this.bot.editMessageText(text,
        {
          chat_id: u.id,
          message_id: u.message_id,
          reply_markup: keyboard.reply_markup
        });
      //console.log("editMessage ret", ret.message_id);
    } catch (e) {
      console.log("editMessage catch", e);
    }

  }
  async tagText(value) {
    //console.log("tagText", value?.toJSON());
    var ret = "";
    if (value) {
      ret = "" + value?.path + value?.name;
      if (value.description) {
        ret += "\n--------------------\n" + value.description;
      };
    }
    if (!ret || ret == '') { ret = "👁️ список открытых сообществ\nможно добавить свое, отправьте его название(опционально с новой строчки можно добавить описание)" }
    if (value){//TODO тут подумать, нужно ли в корне тоже суммарное?
      //думаю нужно, но только тех сообществ, на которые подписан
      ret = ret + "\n----------------------" + await this.DB.getTextChild(value?.id);
    }
    return ret;
    return "вы находитесь в сообществе " + value.path + value.name + "\n" + (value.description ?? "описание сообщества/можно добавить своё");
  }
  async initUser(u) {
    console.log("initUser", u.username, u.id, this.startTag);
    const user = await this.DB.createUser(u);
    console.log("initUser after create", user?.name);
    await user.incrementalPatch({
      nowtag: this.startTag
    });
    return user;
  }
  async deleteMessageId(chat_id, message_id, time = 3) {
    setTimeout(() => {
      this.bot.deleteMessage(chat_id, message_id);
    }, time * 1000);
  }
  async onTags(u) {
    const username = u.username;
    var user = await this.getUserOrCreate(u);
    var nowtag = await this.DB.getTag(user.nowtag);//await user.get("nowtag").then();
    console.log("nowtag", nowtag?.toJSON());
    var text = await this.tagText(nowtag, user.state);
    const treeTags = await this.DB.getTagChilds(nowtag?.id);
    const keyboard = await this.keyboard(nowtag ? "tags" : "root", treeTags, user.state);
    const msg = await this.bot.sendMessage(u.id, text, keyboard);
    await user.incrementalPatch({ message_id: msg.message_id });
  }
  actionLog(act, user, info = ''){
    console.log("++++action", act, user?.name ?? user?.username ?? '', user?.first_name ?? '', user?.last_name ?? '', info);
  }
  async  getUserOrCreate(user){
    var u = await this.DB.getUser(user.id);
    if (!u) u = await this.initUser(user);
    return u;
  }
  start() {
    console.log("bot started");
    this.bot.onText(/\/start/gmi, async (msg, match) => {//TODO сделать переход в необходимый тег при старте с параметром
      const username = msg.from.username;
      console.log("/start", username, msg.from);
      //return;
      //var user = await this.DB.getUser(msg.from.id);
      //if (!user) user = await this.initUser(msg.from);
      const user = await this.getUserOrCreate(msg.from);
      this.actionLog('start', user);
      //console.log("+++", username, "start");
      this.deleteMessageId(msg.chat.id, msg.message_id, 0);
      //this.bot.sendMessage(msg.chat.id, this.i18n.__("start"));
      await this.onTags(msg.from);
    });
    this.bot.onText(/\/tags$/gmi, async (msg, match) => {
      const username = msg.from.username;
      console.log("/tags", username);
      this.deleteMessageId(msg.chat.id, msg.message_id, 0);
      this.onTags(msg.from);
      return;
    });
    this.bot.on('location', async (msg) => {
      console.log(msg.location.latitude);
      console.log(msg.location.longitude, this.geo);
      //TODO подключить как минимум еще яндекс?
      const units = await this.nominatim.reverse({
        lat: msg.location.latitude,
        lon: msg.location.longitude
      }
      );
      const addr = units.address;
      console.log(units.address);
      var geotree = [];
      const a = Array.from(new Set(["🌍", addr.country, addr.region, addr.state, addr.county, addr.city, addr.town, addr.suburb, addr.road, addr.house_number, addr.building]));
      //TODO повторения убрать(москва москва)
      a.forEach(addr => {
        if (addr) {
          geotree.push(addr);
        };
      })
      const geo = await this.DB.addTags(geotree);
      //const geo = await this.createTree("blocktree", geotree);//TODO подумать
      //подумал. будут отдельные деревья для каждого тега..?
      console.log("location", geo, geotree);
      const username = msg.from.username;
      const user = await this.getUserOrCreate(msg.from);
      this.actionLog("location", user, geotree);
      await user.incrementalPatch({nowtag: geo});
      //this.db.get("users").get(username).get("nowtag").put(geo);
      this.deleteMessageId(msg.chat.id, msg.message_id, 0);
      this.onTags(msg.from);
    });

    this.bot.onText(/^\/debug_on$/gmi, async (msg, match) => {
      this.db.get("users").get(msg.from.username).put({ "debug": true }).once((val) => {
        console.log("debug_on", val);
        this.connect(msg.from.username, "debug");
        this.bot.sendMessage(msg.chat.id, "режим отладки включен");//TODO количество онлайн
      });
    });

    this.bot.onText(/^\/debug_off$/gmi, async (msg, match) => {
      this.db.get("users").get(msg.from.username).put({ "debug": false });
      this.bot.sendMessage(msg.chat.id, "режим отладки выключен");//TODO количество онлайн
    });

    this.bot.onText(/^\/me$/gmi, async (msg, match) => {
      console.log("/me call", msg.from.username);
      this.db.get("users").get(msg.from.username).once(val => {
        console.log("/me call val", val);
        this.db.get(val?.nowtag).once(t => {
          this.bot.sendMessage(msg.chat.id, "now " + t?.path + t?.name);//val.nowtag);//TODO количество онлайн
        });
      });
    });

    this.bot.onText(/^\/help$/gmi, async (msg, match) => {
      //console.log("/me call", msg.from.username);
      var user = await this.getUserOrCreate(msg.from);
      this.actionLog("/help", user);
      await user.incrementalPatch({nowtag: '30543ed15339fbce5aeef0aab97d282f'});
      this.editTagMessage(msg.from);
    });

    this.bot.onText(/^(.*)$/m, async (msg, match) => {
      //TODO в будущем тут 3 варианта - друзья(13), друзья друзей(234), друзья друзей друзей(3423)
      //важность и охват регулируются количеством восклицательных знаков в начале !!!
      var text = match.input;
      if (text.startsWith("/")) {
        //text = text.slice(1);
        //TODO сделать переход в тег?
        this.deleteMessageId(msg.chat.id, msg.message_id, 1);
        return
      };//команды пропускаем
      console.log("-->", msg.chat.username, msg.chat.id, text);
      const username = msg.from.username;
      //this.deleteMessage(username, msg.message_id);
      var pretext = "";
      if (text[0] == "?") {
        text = text.slice(1);
        pretext = "?";
      } else {
        pretext = "@" + username + " ";//TODO если начинается с вопроса - то анонимно
      }
      pretext = "";//пока все сообщения анонимные
      //TODO сделать возможность ответа!! там можно прислать свои данные?
      //console.log("before parse");
      var parse = this.parseString(text);
      //console.log("parse", parse);
      text = pretext + text;
      var user = await this.getUserOrCreate(msg.from);
      var mm = text.match(/^(.+)$/igm);
      //console.log("mm", mm);
      const newTag = await this.addTag(msg.chat, mm);
      this.actionLog("create", user, [newTag?.name, newTag?.path]);
      console.log(newTag?.toJSON());
      //console.log("+++", username, "create", newTag.path, "->", newTag.name, newTag?.description);
      this.deleteMessageId(msg.chat.id, msg.message_id, 1);
      //u.get("state").put("chat");
      return;
      //}
    });

    this.bot.on('callback_query', async (callbackQuery) => {
      const data = callbackQuery.message;
      const command = callbackQuery.data
      const username = data.chat.username;
      const c = command.match(/^tag:(.*)$/);
      console.log("callback_query", username, command);
      var user = await this.getUserOrCreate(data.chat);
      const tag = await this.DB.getTag(user.nowtag);
      if (c && c[1]) {//заходим в тег 
        const newTag = await this.DB.getTag(c[1]);
        this.actionLog("in", user, [newTag?.path, newTag?.name]);
        if (newTag){
          await user.incrementalPatch({nowtag: newTag.id});
        }
      }
      if (command == "up" && tag) {
        if (tag?.name) {
          this.actionLog("up", user, [tag.path, tag.name]);
          await user.incrementalPatch({nowtag: tag.parent_id});
        } else {
          this.bot.sendMessage(data.chat.id, "вы уже в корне дерева, выше некуда(").then(msg => {
            this.deleteMessageId(data.chat.id, msg.message_id);
          });
        }
      }
      if (command == "subscribe") {//TODO сделать)
        this.bot.sendMessage(data.chat.id, "в разработке").then(msg => {
          this.deleteMessageId(data.chat.id, msg.message_id);
        });
      }
      if (command == "delete") {//TODO сделать)
        this.bot.sendMessage(data.chat.id, "в разработке").then(msg => {
          this.deleteMessageId(data.chat.id, msg.message_id);
        });
      }
      if (command == "private") {//TODO сделать)
        this.db.get("users").get(username).get("publicMode").put(false);
        this.bot.sendMessage(data.chat.id, "В разработке").then(msg => {
          this.deleteMessageId(data.chat.id, msg.message_id);
        });
      }
      if (command == "public") {//TODO сделать)
        this.db.get("users").get(username).get("publicMode").put(true);
        this.bot.sendMessage(data.chat.id, "В разработке").then(msg => {
          this.deleteMessageId(data.chat.id, msg.message_id);
        });
      }
      try {
        await this.editTagMessage(data.chat);
        return;
      } catch (e) {
        console.log("error", e);
      }
    });

  }

  parseString(str) {
    // Split the string into an array of words
    const words = str.split(/\s+/);

    // Create an empty array to store the extracted tags and addresses
    const extractedTags = {};
    const extractedAddr = {};

    // Loop through each word in the array
    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Check if the word starts with #
      if (word.startsWith('#')) {
        // If it does, add it to the extractedTags array
        extractedTags[word.slice(1)] = 1;
      }

      // Check if the word starts with @
      if (word.startsWith('@')) {
        // If it does, add it to the extractedTags array
        if (word.length > 1) {
          extractedAddr[word.slice(1)] = 1;
        };
      }
    }
    //console.log(extractedAddr, extractedTags);
    return { tags: Object.keys(extractedTags), addr: Object.keys(extractedAddr) };
  }
  async keyboard(id = "tags", tags = [], userData = {}) {
    //tags [{name,hash}]
    //console.log("keyboard", id, tags, userData);
    const subscribe = true;//userData?.subscribe;
    const publicMode = true;//userData?.publicMode;
    var tagsKeyboard = [];
    if (tags) {
      //const t = await this.db.get(tags).then();
      //console.log("t==", t);
      //if (t) {
      tags.forEach(tag => {//TODO сортировка по времени поле updated?
        //if (tt == '_') { return }
        if (tag?.name) {
          tagsKeyboard.push([{ text: tag.name, callback_data: "tag:" + tag?.id }]);
        }
      })
    }
    if (id == "tags") {
      return {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `✂️`,
                callback_data: 'delete'
              },//✂️📄🔍⚙️⌛🔒🔓🌍🗑️📅
              {
                text: `⬆️`,
                callback_data: 'up'
              },
              //            {
              //              text: `🗨️`,//💾
              //              callback_data: 'add'
              //            },
              //            {
              //              text: `🔊`,//🔊🔈🔉
              //              callback_data: 'chat_on'
              //            },
              {
                text: subscribe ? `❤️` : `💔`,
                callback_data: subscribe ? 'subscribe' : 'unsubscribe'
              },
            ],
            ...tagsKeyboard
          ]
        }
      }
    }
    if (id == "root") {
      return {
        reply_markup: {
          inline_keyboard: [
            //TODO сделать закрытую часть. приватную.
            //доступ по ссылке(тут подумать, как то ограничить?) или можно вручную добавлять
            //в закрытом теге есть тоже разные уровни. самый простой - по ссылке, человек попадает в велком
            //а из велкома его уже может какой-либо участник сообщества добавить/повысить до равноправного члена сообщества?
            [
              {
                text: `⌛`,
                callback_data: publicMode ? 'private' : 'public'
              },              {
                text: publicMode ? `🔒` : `👁️`,
                callback_data: publicMode ? 'private' : 'public'
              },              {
                text: true ? `⚙️` : `👁️`,
                callback_data: publicMode ? 'private' : 'public'
              }
            ],
            ...tagsKeyboard
          ]
        }
      }
    }
  }
}

export default Bot;
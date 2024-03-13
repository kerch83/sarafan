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
    //    const TelegramBot = require('node-telegram-bot-api');
    this.nominatim = client;
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db;
    this.i18n = i18n;
    this.tags = this.parseString(tags);
    console.log("this.tags", this.tags, tags);
    this.startTag = await this.createTree("blocktree", this.tags.tags);//TODO передавать хеш дерева, их много...
    this.tagLists = {};
    const rootList = await this.getTagsList(this.db.get("blocktree"));
    const rootHash = await this.db.get("blocktree").get("hash").then();
    console.log("rootList", rootList, rootHash);
    this.tagLists[rootHash] = rootList;
    //TODO может и не надо делать root? в руте видно только то, что создал сам?
    console.log("start bot ver", pkg.version.toString(), this.startTag.hash);
  }
  async createTreeRecursive(tree = []) {
    console.log("createTreeRecursive", tree);
  }
  async getTagsList(root, level = 7) {//TODO проверку от зацикливания? хотя по идее всё переписать надо(
    const tags = await root.get("tags").then();
    console.log("createTagList", level, tags);
    if (!tags || level < 0) { return [] };
    const list = Array();
    const tagsList = Object.keys(tags);
    for (const tag of tagsList) {
      if (tag !== "_") {
        const child = this.db.get(tags[tag]);
        if (this.tagLists[tag]){
          console.log("tag already set, return", level ,tag, this.tagLists[tag]);
          return [];
        } else {
          console.log("call getTagList", level, tag);
        }
        const childList = await this.getTagsList(child, level - 1);
        const data = await child.then();
        //console.log("tag--", tag, childList);
        this.tagLists[tag] = childList;
        list.push({ name: data?.name, hash: data?.hash, length: childList.length });
      }
    }
    console.log("return list", list);
    return list;
  }
  async createTree(tree, tags = []) {
    console.log("createTree", tree, tags);
    var parent = this.db.get(tree);
    const hash = md5("");
    const data = { name: "", path: '', description: this.i18n.__("root.description"), hash };
    parent.put(data);
    var path = "";
    for (const tag of tags) {
      const tr = await this.addTagBase(parent, [tag]);
      if (tr) {
        console.log("tag added!!", tr.name, tr.hash, tr._);
        parent = this.db.get(tr._);//!! на эту строчку ушел весь день, но оно наконец работает)
      } else {
        console.log("tag not added");
      }
    }
    return parent;
  }
  async addTagBase(parent, arr) {//TODO добавлять не только текст.
    //фото видео. события(добавить дату начала/конца). задачи(то попозжее)?
    try {
      const name = arr.shift().toLowerCase();
      console.log("addTagBase start", name);
      const description = arr.join("\n");
      const ntag = await parent.then();
      console.log("parent", ntag.name, ntag.hash, ntag.parent);
      const path = ntag.path + ntag.name + " #";
      const hash = md5(path + name);
      const data = { name, description, path, hash };
      const newTag = this.db.get(hash);
      const t = await newTag.then();
      if (!t) {
        console.log("add tag new, save data");
        newTag.put(data);
        newTag.get("parent").put(parent);//Только так можно сохранять рефы
        //TODO везде проверить
      } else {
        console.log("tag exist, need update", t.name, t.hash);
        this.cutTag(ntag.hash, t);
        //        newTag.get("childtree").put(childtree);
        //        newTag.get("parenttree").put(parent);//TODO тут ошибка?
        //TODO меняем описание но только для этого юзера?? совместное редактирование. тут надо сильно подумать))
        if (description) {//TODO пока просто добавляем описание, но надо сделать по другому
          //описания будут хранится в отдельном теге и между ними можно будет выбирать.
          newTag.get("description").put(t.description + "\n----------\n" + description);
        }
        //return newTag.then();
      }
      console.log("parent tags before add hash", hash, await parent.get("tags").then(), await parent.then());
      const ttag = parent.get("tags").get(hash);
      console.log("-----", await parent.then(), await parent.get("tags").get(hash));
      ttag.put(newTag);//TODO здесь ошибка? а-а-ааа
      console.log("-----", await parent.then());
      //что-то я уже не хочу этот ган((
      this.updateTag(ntag.hash, { name, hash });
      console.log("addTag", ntag?.path, ntag?.name, name);
      console.log("parent tags after", await parent.get("tags").then(), await parent.then());
      return newTag.then();
    } catch (err) {
      console.log("error", err.message);
      return null;
    }
  }
  async touch(node) {
    const tag = await node.then();
    const parent = await this.db.get(tag.parent).then();
    if (!parent) { return }
    console.log("touch", tag.name, tag.hash, tag.parent, parent?.name, parent?.hash);
    if (tag.hash == parent.hash) {
      console.log("----------------------------err", tag, parent);
      return;
    }
    const item = { name: tag.name, hash: tag.hash };
    this.cutTag(parent.hash, item);
    this.updateTag(parent.hash, item);
    console.log(this.tagLists);
  }
  updateTag(hash, item) {
    var list = this.tagLists[hash] ?? Array();
    list.unshift(item);
    this.tagLists[hash] = list;
    console.log("set first tag", item?.name, this.tagLists[hash]);
  }
  async cutTag(hash, tag) {
    const newList = this.tagLists[hash]?.filter(t => t.hash !== tag.hash);
    this.tagLists[hash] = newList;
  }
  async addTag(user, arr) {
    const parent = this.db.get("users").get(user).get("nowtag");
    const child = await this.addTagBase(parent, arr);
    this.touch(parent);
    this.editTagMessage(user);
  }
  async editTagMessage(user) {
    const u = await this.db.get("users").get(user).then();
    //console.log("editMessage", user);
    const t = await this.db.get("users").get(user).get("nowtag").then();
    console.log("editMessage", t?.name, t?.hash, t?.childstart, t?.childtree);
    if (!t) {
      console.log("!!!!!!!!! t undefined");
      return;
    }
    const text = this.tagText(t);
    const treeTags = await this.getTagPlain(t.hash);
    const keyboard = await this.keyboard(t.name == "" ? "root" : "tags", treeTags, u);
    console.log("editTagMessage", u.id, u.message_id, text, keyboard);
    if (!u.message_id) {//нечего исправлять, отправляем
      this.onTags(user, u.id);
      return;
    }
    try {
      const ret = await this.bot.editMessageText(text,
        {
          chat_id: u.id,
          message_id: u.message_id,
          reply_markup: keyboard.reply_markup
        });
      console.log("editMessage ret", ret.message_id);
    } catch (e) {
      console.log("editMessage catch", e);
    }

  }
  tagText(value) {
    var ret = "";
    if (value) {
      ret = "" + value?.path + value?.name;
      if (value.description) {
        ret += "\n" + value.description;
      };
    }
    if (!ret || ret == '') { ret = "#" }
    return ret;
    return "вы находитесь в сообществе " + value.path + value.name + "\n" + (value.description ?? "описание сообщества/можно добавить своё");
  }
  async initUser(username, id) {
    console.log("initUser", username, id);
    const u = this.db.get("users").get(username);
    u.get("id").put(id);
    u.get("nowtag").put(this.startTag);
    u.get("chatmode").put(true);
    u.get("username").put(username);
    u.get("state").put("chat");
    u.get("publicMode").put(true);
    const userData = await u.then();
    console.log("initUser created", userData.username);
    //this.connect(username);
  }
  async deleteMessage(user, message_id, time = 0) {
    const chat_id = this.db.get("users").get(user).get("id").then();
    this.bot.deleteMessage(chat_id, message_id);
  }
  async deleteMessageId(chat_id, message_id, time = 3) {
    setTimeout(() => {
      this.bot.deleteMessage(chat_id, message_id);
    }, time * 1000);
  }
  async onTags(username, chatId) {
    const user = this.db.get("users").get(username);
    const userData = await this.db.get("users").get(username).then();
    console.log("onTags", username);
    if (!userData) {//new
      console.log("before initUser", username);
      this.initUser(username, chatId);
    }
    var value = await user.get("nowtag").then();
    if (!value) {
      //value = await this.db.get("blocktree").then();
      if (this.startTag) {
        //value = await this.startTag.then();//await this.db.get("blocktree").then();
        value = this.startTag;
        user.get("nowtag").put(this.db.get(this.startTag));
      } else {
        value = await this.db.get("blocktree").then();
        user.get("nowtag").put(this.db.get("blocktree"));
      }
      console.log("user new nowtag", value);
    }
    console.log("nowtag", value.name, value.hash);
    var text = this.tagText(value);
    //if (!value.name) { text = "" };
    var treeTags = [];
    treeTags = await this.getTagPlain(value.hash);
    console.log("treeTags", treeTags);
    const keyboard = await this.keyboard(value.name == "" ? "root" : "tags", treeTags, userData);
    console.log("send tags list", username, text, keyboard);
    const msg = await this.bot.sendMessage(chatId, text, keyboard);
    console.log("sendMessage", msg.chat.username, msg.message_id);
    const old_message_id = await user.get("message_id").then();
    this.deleteMessageId(msg.chat.id, old_message_id, 0);
    user.get("message_id").put(msg.message_id);
  }
  async getTagPlain(hash, skip = 0) {//решил сделать по простому)
    //const treeData = await tree.then();
    console.log("getTagPlain", hash);
    //if (!treeData || !treeData.name){
    //  return [];
    //}
    //потом эти массивы буду храниться у пользователей локально
    return this.tagLists[hash] ?? [];
  }
  start() {
    console.log("bot started");
    this.bot.onText(/\/start/gmi, (msg, match) => {//TODO сделать переход в необходимый тег при старте с параметром
      const username = msg.from.username;
      console.log("/start", username);
      this.initUser(username, msg.from.id);
      this.deleteMessageId(msg.chat.id, msg.message_id, 0);
      //this.bot.sendMessage(msg.chat.id, this.i18n.__("start"));
      this.onTags(username, msg.chat.id);
    });
    this.bot.onText(/\/tags$/gmi, async (msg, match) => {
      const username = msg.from.username;
      console.log("/tags", username);
      this.deleteMessageId(msg.chat.id, msg.message_id, 0);
      this.onTags(username, msg.chat.id);
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
      const geo = await this.createTree("blocktree", geotree);//TODO подумать
      //подумал. будут отдельные деревья для каждого тега..?
      console.log("location", geotree);
      const username = msg.from.username;
      this.db.get("users").get(username).get("nowtag").put(geo);
      this.deleteMessageId(msg.chat.id, msg.message_id, 0);
      this.onTags(username, msg.chat.id);
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
      console.log("parse", parse);
      text = pretext + text;
      const user = await this.db.get("users").get(username).then();
      //console.log(user);
      if (!user) {//new
        console.log("before initUser", username);
        this.initUser(username, msg.from.id);
      }
      //const u = this.db.get("users").get(username).put({ "id": msg.from.id });
      //const state = await u.get("state").then();
      //console.log("state", state);
      //if (true || state == "addtag") {//TODO пока вообще без чата. чат будет в вебе.
      var mm = text.match(/^(.+)$/igm);
      console.log("mm", mm);
      this.addTag(username, mm);
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
      console.log("data", data.chat.id, data.message_id);
      const nowtag = this.db.get("users").get(username).get("nowtag");
      //
      const t = await nowtag.then()
      //const nowtag = this.db.get(nowtagData._);
      //const t = ;
      console.log("t,c", t, c);
      if (!t) { return };
      if (c && t) {//заходим в тег 
        const tagsList = await nowtag.get("tags").then();
        console.log(">>nowtag", t?.path, t?.name, t?.hash, tagsList);//, nowtag);
        const ntag = nowtag.get("tags").get(c[1]);
        const nn = await ntag.then();
        console.log("ntag", c[1], nn?.name, nn?.parent);
        if (nn && nn.name) {
          console.log("nowtag put", nn.name);
          //TODO копипаста, переделать нормально
          //this.disconnect(username);
          nowtag.put(ntag);
          //return;
          //this.connect(username);
        };
      }
      if (command == "up" && t) {
        console.log("up nowtag--", t.name, t.path, t.parent);
        if (t.parent) {
          nowtag.put(this.db.get(t.parent));
        } else {
          this.bot.sendMessage(data.chat.id, "вы уже в корне дерева, выше некуда(").then(msg => {
            this.deleteMessageId(data.chat.id, msg.message_id);
          });
        }
        //return;
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
      try {//TODO это не здесь, а в колбэке nowtag?
        console.log("before editTagMessage");
        this.editTagMessage(data.chat.username);
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
    console.log("keyboard", id, tags, userData);
    const subscribe = userData?.subscribe;
    const publicMode = userData?.publicMode;
    var tagsKeyboard = [];
    if (tags) {
      //const t = await this.db.get(tags).then();
      //console.log("t==", t);
      //if (t) {
      tags.forEach(tag => {//TODO сортировка по времени поле updated?
        //if (tt == '_') { return }
        if (tag?.name) {
          tagsKeyboard.push([{ text: tag.name, callback_data: "tag:" + tag?.hash }]);
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
              },//✂️📄🔍⚙️⌛🔒🔓🌍🗑️
              {
                text: `↩️`,
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
                        [
                          {
                            text: publicMode ? `🔒` : `👁️`,
                            callback_data: publicMode  ? 'private' : 'public'
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
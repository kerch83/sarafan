import pkg from './package.json' assert { type: "json" };
import TelegramBot from 'node-telegram-bot-api';
import nominatim from 'nominatim-client';
const client = nominatim.createClient({
  useragent: "sarafan",             // The name of your application
  referer: 'http://srfn.su',  // The referer link
});
class Bot {
  commands = {
    "friend": "Добавить друзей(подписаться на их сообщения)"
  };
  constructor(){}
  async init(token, db, i18n, tags) {
    //    const TelegramBot = require('node-telegram-bot-api');
    this.nominatim = client;
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db;
    this.i18n = i18n;
    this.tags = this.parseString(tags);
    console.log("this.tags", this.tags, tags);
    this.geo = this.connectGeo();
    //this.startTag = this.createTree("blocktree");
    this.startTag = await this.createTree("blocktree", this.tags.tags);//TODO передавать хеш дерева, их много...
    //this.startTag = tr;
    //this.startTag.get("debug").put("bot started ver " + pkg.version.toString());
    //this.connectUsers();
    console.log("start bot ver", pkg.version.toString(), this.startTag);
  }
  async createTreeRecursive(tree = []){
    console.log("createTreeRecursive", tree);
  }
  async createTree(tree, tags = []) {
    console.log("createTree", tree, tags);
    var parent = this.db.get(tree);
    const data = { name: "", path: '', description: this.i18n.__("root.description") };
    parent.put(data);
    var path = "";
    for (const tag of tags){
      const tr = await this.addTagBase(parent, [tag]);
      console.log("tag added!!", tr.name, tr._);
      //parent = tr;
      parent = this.db.get(tr._);//!! на эту строчку ушел весь день, но оно наконец работает)
    }
    return parent;
  }
  async addTagBase(parent, arr) {
    try{
    const name = arr.shift();
    console.log("addTagBase start", name);
    const description = arr.join("\n");
    //const ntag = await parent.then();
    const ntag = await parent.then();
    console.log("parent", ntag.name);
    const data = { name, parent, description, path: ntag.path + ntag.name + "/" };
    const newTag = parent.get("tags").get(name).put(data);
    console.log("addTag", ntag.path, ntag.name, name);
    return newTag.then();
    }catch(err){
      console.log("error", err.message);
      return null;
    }
  }
  async addTag(user, arr) {
    const parent = this.db.get("users").get(user).get("nowtag");
    await this.addTagBase(parent, arr);
    this.editTagMessage(user);
  }
  connectGeo() {
    //TODO подключить номинатум и загрузить сразу дерево? или добавлять по мере подключения юзеров?
    return this.db.get("geotree");
  }
  connectUsers() {
    this.db.get("users").once(users => {
      if (!users) { return };
      Object.keys(users).forEach(user => {
        if (user == '_') { return };
        console.log("connectUser", user);
        this.db.get("users").get(user).once(u => {
          console.log("user tag ", u.nowtag);
          if (u.chat) {
            this.connect(user)
          }
          if (u.debug) {
            this.connect(user, "debug")
          }
          //});
          this.db.get("users").get(user).get("nowtag").on(async t => {
            console.log("----------------on nowtag", t.name, u.username);

            //TODO что-то тут нужно будет делать
            //в итоге этот колбек подглючивает( решил сделать прямо в обработчике
            return;
            const text = this.tagText(t);
            const keyboard = await this.keyboard("tags", t.tags);
            console.log("editMessage", u.id, u.message_id, text, keyboard);
            const ret = this.bot.editMessageText(text,
              {
                chat_id: u.id,
                message_id: u.message_id,
                reply_markup: keyboard.reply_markup
              });
          })
        });
      })
      //console.log(users);
    })
  }
  async disconnect(user, channel = "chat") {//TODO пока даже не очень понятно что тут должно быть
    const gunUser = this.db.get("users").get(user);
    //gunUser.get("connected").put(false);
    const t = await gunUser.get("nowtag").then();
    this.db.get(t).get(channel).get("subscribers").get(user).put(false);
    console.log("disconnect", user, await gunUser.get("nowtag").get("name").then());
  }
  async connect(user, channel = "chat", tag = null) {//TODO приватные каналы - хеши? открытые ключи?
    const gunUser = this.db.get("users").get(user);
    const u = await gunUser.then();//u => {
    const t = tag ?? u.nowtag;
    console.log("connect", user, t, channel);
    if (u.connected) {
      console.log("connected");
      return;
    };
    if (!t) { return }
    gunUser.get("connected").put(true);
    const tval = await this.db.get(t).then();
    console.log("connect tag", t, tval)
    //this.bot.sendMessage(u.id, "Вы подключились к " + channel + " в сообществе " + tval?.path + tval?.name);
    //this.bot.sendMessage(u.id, tval?.path + tval?.name + "\nподключился @" + u.username);
    this.db.get(t).get(channel).get("subscribers").get(user).put(true);
    return;//TODO переделать отправку в чат
    this.db.get(t).get(channel).on(val => {
      console.log("--->>>>>>send message to ", user, val, channel);
      var text = val.text ?? val;
      //if (!val.text) { text  }
      if (true || u.debug || val.username !== user) {
        //TODO переделать на очередь с проверкой от задваивания
        this.bot.sendMessage(u.id, tval?.path + tval?.name + "\n" + text);
      }
      if (val.username !== user) {
        //TODO удаление сообщения?
        //this.bot.
      }
    })
  }
  async editTagMessage(user) {
    const u = await this.db.get("users").get(user).then();
    //console.log("editMessage", user);
    const t = await this.db.get("users").get(user).get("nowtag").then();
    //console.log("editMessage t", t);
    const text = this.tagText(t);
    const keyboard = await this.keyboard(t.name == "" ? "root" : "tags", t?.tags);
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
    if (!ret || ret == '') { ret = "/" }
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
    const userData = await u.then();
    console.log("initUser created", userData);
    //this.connect(username);
  }
  async deleteMessage(user, message_id, time = 0) {
    const chat_id = this.db.get("users").get(user).get("id").then();
    this.bot.deleteMessage(chat_id, message_id);
  }
  async deleteMessageId(chat_id, message_id, time = 5) {
    setTimeout(() => {
      this.bot.deleteMessage(chat_id, message_id);
    }, time * 1000);
  }
  async onTags(username, chatId) {
    const user = this.db.get("users").get(username);
    const userData = await this.db.get("users").get(username).then();
    console.log("onTags", userData.username);
    if (!userData) {//new
      console.log("before initUser", username);
      this.initUser(username, chatId);
    }
    //const user1 = await this.db.get("users").get(username).then();
    //console.log("uuuuu", user, user1);
    //user.get("nowtag").once(async (value, key) => {
    var value = await user.get("nowtag").then();
    //console.log("value", value);
    if (!value) {
      //value = await this.db.get("blocktree").then();
      if (this.startTag){
      value = await this.startTag.then();//await this.db.get("blocktree").then();
      user.get("nowtag").put(this.startTag);
      }else {
        value = await this.db.get("blocktree").then();
        user.get("nowtag").put(this.db.get("blocktree"));
      }
      console.log("user new nowtag", value);
    }
    console.log("nowtag", value.name);
    var text = this.tagText(value);
    //if (!value.name) { text = "" };
    const keyboard = await this.keyboard(value.name == "" ? "root" : "tags", value.tags);
    console.log("send tags list", username, text);
    const msg = await this.bot.sendMessage(chatId, text, keyboard);
    console.log("sendMessage", msg.chat.username, msg.message_id);
    const old_message_id = await user.get("message_id").then();
    this.deleteMessageId(msg.chat.id, old_message_id, 0);
    user.get("message_id").put(msg.message_id);
  }
  start() {
    console.log("bot started");
    this.bot.onText(/\/start/gmi, (msg, match) => {
      const username = msg.from.username;
      console.log("/start", username);
      this.initUser(username, msg.from.id);
      this.deleteMessageId(msg.chat.id, msg.message_id, 0);
      //this.bot.sendMessage(msg.chat.id, this.i18n.__("start"));
      this.onTags(username, msg.chat.id);
    });
    this.bot.onText(/\/tags$/gmi, async (msg, match) => {
      console.log("<--/tags?", msg.from.username);
      //const text = this.db.get("")
      const username = msg.from.username;
      console.log("/tags", username);
      this.deleteMessageId(msg.chat.id, msg.message_id, 0);
      this.onTags(username, msg.chat.id);
      return;
      const user = this.db.get("users").get(username);
      const userData = await this.db.get("users").get(username).then();
      console.log(userData);
      if (!userData) {//new
        console.log("before initUser", username);
        this.initUser(username, msg.from.id);
      }
      //const user1 = await this.db.get("users").get(username).then();
      //console.log("uuuuu", user, user1);
      //user.get("nowtag").once(async (value, key) => {
      var value = await user.get("nowtag").then();
      console.log("value", value);
      if (!value) {
        value = await this.db.get("blocktree").then();
        user.get("nowtag").put(value);
        console.log("user new nowtag", value);
      }

      if (value) {
        console.log("nowtag", value.name);
        var text = this.tagText(value);
        //if (!value.name) { text = "" };
        const keyboard = await this.keyboard(value.name == "" ? "root" : "tags", value.tags);
        console.log("send tags list", username, text);
        this.bot.sendMessage(msg.chat.id, text, keyboard).then(msg => {
          console.log("sendMessage", msg.chat.username, msg.message_id);
          user.get("message_id").put(msg.message_id);
        });
      }
      //});
    });
    this.bot.onText(/\/geos$/gmi, async (msg, match) => {
      console.log("<--geos11111", msg.from.username);
      return;
      //const text = this.db.get("")
      const username = msg.from.username;
      const user = this.db.get("users").get(username);
      user.get("nowgeo").once((value, key) => {
        console.log("key->value", key, value);
        var text = "";
        if (value) {
          text = "вы находитесь в гео-сообществе " + value.path + value.name + "\n" + value.description ?? "описание сообщества";
        } else {
          text = "вы находитесь в гео-сообществе Земля";
        }
        console.log("send geo-tree", username, text);
        this.bot.sendMessage(msg.chat.id, text, this.keyboard("geo")).then(msg => {
          console.log("sendMessage", msg);
        });
      });
    });
    this.bot.onText(/\/livelocation/, async msg => {
      this.bot.sendLocation(msg.chat.id, 0, 0, {
        live_period: 86400,
      });
    });
    this.bot.on('location', async (msg) => {
      console.log(msg.location.latitude);
      console.log(msg.location.longitude, this.geo);
      //TODO подключить как минимум еще яндекс
      const units = await this.nominatim.reverse({
        lat: msg.location.latitude,
        lon: msg.location.longitude
      }
      );
      const addr = units.address;
      console.log(units.address);
      var geotree = [];
      const a = ["🌍", addr.country, addr.region, addr.state, addr.county, addr.city, addr.town, addr.suburb, addr.road, addr.house_number, addr.building];
      a.forEach(addr => {
        if (addr) {
          geotree.push(addr);
        };
      })
      const geo = this.createTree("blocktree", geotree);
      console.log("location", geotree);
      const username = msg.from.username;
      this.db.get("users").get(username).get("nowtag").put(geo);
      this.connect(username);
      //this.startTag = tr;
      //const text = "присоединился @" + username;
      //geo.get("chat").put({ text, username });
    });
    this.bot.onText(/^\/friends (.*)$/gmi, async (msg, match) => {
      return;
      console.log("<--/friends add", match, msg);
      //const text = this.db.get("")
      const username = msg.from.username;
      const friend = match[1];
      const user = this.db.get("users").get(username);
      //const val = user.get("friends").get(friend).put(10);
      //val[friend] = {};
      //const fr = this.db.get(friend);
      //const friends = user.get("friends");
      //friends.get(friend).put(true);
      //console.log(friends);
      //const val = friends.once();
      //console.log(val);
      const q = user.get("friends");
      const text = friend + " добавил\nсписок друзей\n" + JSON.stringify(q);
      console.log("send friend list", username, val, text);
      //this.bot.sendMessage(msg.chat.id, text);
    });

    this.bot.onText(/^\/subscribe(.*)$/gmi, async (msg, match) => {
      this.bot.sendMessage(msg.chat.id, "в разработке");
    });

    this.bot.onText(/^\/chat_on$/gmi, async (msg, match) => {
      this.db.get("users").get(msg.from.username).put({ "chatmode": true }).once(async (val) => {
        console.log("chat_on", val);
        this.connect(msg.from.username);
        const tag = await this.db.get(val.nowtag).then();
        const subs = await this.db.get(val.nowtag).get("chat").get("subscribers").then();
        console.log("subs", subs);
        var online = 0;
        Object.keys(subs).forEach(u => {
          if (subs[u] == true) online++;
        })
        this.bot.sendMessage(msg.chat.id, tag.path + tag.name + " (" + online + " online)\nрежим чата включен");//TODO количество онлайн
      });
    });

    this.bot.onText(/^\/chat_off$/gmi, async (msg, match) => {
      this.db.get("users").get(msg.from.username).put({ "chatmode": false });
      this.disconnect(msg.from.username);
      this.bot.sendMessage(msg.chat.id, "режим чата выключен");//TODO количество онлайн
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
        this.db.get(val.nowtag).once(t => {
          this.bot.sendMessage(msg.chat.id, "now " + t.path + t.name);//val.nowtag);//TODO количество онлайн
        });
      });
    });


    this.bot.onText(/^#(.*) (.*)$/, (msg, match) => {
      return;
      const chatId = msg.chat.id;
      const text = msg.text;
      const username = msg.from.username;
      const lang = msg.from.language_code;
      console.log("-->", username, chatId, text, match);
      const user = this.db.user(username);
      //console.log("user", user);
      // Get all chat ids of users who are subscribed to the user
      const chatIds = [chatId];

      // Send the message to all subscribed users
      chatIds.forEach((id) => {
        console.log("send to", id, text);
        this.bot.sendMessage(id, "@" + username + " " + text, {
          reply_markup: {
            inline_keyboard1: [
              [{
                text: `🔞`,
                callback_data: 'cb1'
              },
              {
                text: `👎️`,
                callback_data: 'cb2'
              },
              {
                text: `👍`,
                callback_data: 'cb3'
              },
              {
                text: `🔥`,
                callback_data: 'cb4'
              },
              ]
            ]
          }
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
        return };//команды пропускаем
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
      console.log("before parse");
      var parse = this.parseString(text);
      console.log("parse", parse);
      text = pretext + text;
      const user = await this.db.get("users").get(username).then();
      console.log(user);
      if (!user) {//new
        console.log("before initUser", username);
        this.initUser(username, msg.from.id);
      }
      const u = this.db.get("users").get(username).put({ "id": msg.from.id });
      const state = await u.get("state").then();
      console.log("state", state);
      if (true || state == "addtag") {//TODO пока вообще без чата. чат будет в вебе.
        var mm = text.match(/^(.+)$/igm);
        console.log(mm);
        this.addTag(username, mm);
        this.deleteMessageId(msg.chat.id, msg.message_id, 1);
        u.get("state").put("chat");
        return;
      }
      //const m = u.get("texts").set(text);//сохранять чат не надо. только посты
      //TODO определять посты и сохранять их. и отсылать тем у кого режим чата выключен тоже. т.е. всем кто подписан на тег
      parse.addr.forEach((user) => {
        if (user !== username) {
          u.get("friends").get(user).put({});
          this.db.get("users").get(user).get("id").once((id) => {
            console.log("send to", user, id);
            if (id) {
              this.bot.sendMessage(id, text);
            } else {
              this.bot.sendMessage(msg.from.id, "@" + user + " еще не в сети, пришлите ему ссылку ");
            }
          })
        }
      });
      var nowtag = u.get("nowtag");
      parse.tags.forEach(async tag => {//TODO здесь переделать
        return;//пока просто отключим
        const ntag = await nowtag.then();
        nowtag = nowtag.get("tags").get(tag).put({ name: tag, parent: nowtag, path: ntag.path + ntag.name + "\n" });
        const antag = await nowtag.then();
        console.log("nowtag==", antag);
        u.get("nowtag").put(antag);
        const nn = await u.get("nowtag").then();
        console.log("nn", nn);
        return;
        u.get("tags").get(tag).set(m);
        const subs = this.db.get("tags").get(tag).get("subscribers");
        subs.get(username).put({});
        //this.bot.sendMessage(msg.chat.id, "вы подписались на тег " + tag);
        subs.once((value) => {
          console.log("-----", tag, value);
          if (value) {
            this.send(value, text, username);
          };
        })
      })
      if (!(parse.addr.length == 0 && parse.tags.length == 0)) { return; }//если нет ни тегов ни людей, то просто всем друзьям друзей?
      //TODO это режим чата выходит. его можно включать/выключать командой
      //а если на сообщение ответили то оно становится постом? точнее оно становится видно новым людям по мере реакций/ответов
      //и еще команда /chat_radius 10 - задает количество км, если 0 то всем? может быть ситуация что части диалога не видно?
      //лучше выбирать в гео-дереве самому? 
      //console.log("send to friends");
      //пока посылаем всем..?
      //TODO надо посылать только в текущий тег
      console.log("send to chat");//, u.get("nowtag"));
      u.get("nowtag").get("chat").put({ text, username });
      this.deleteMessageId(msg.chat.id, msg.message_id, 1);
      return;//хм
      //u.get("")
      //u.get("friends")
      this.db.get("users").once((val) => {
        if (!val) { console.log(val); return; }
        console.log("chat", val);
        console.log(Object.keys(val));
        this.send(val, text, username);
        return;
        Object.keys(val).forEach((val) => {
          this.db.get("users").get(val).get("id").once((id) => {
            console.log("chat send to", val, id);
            if (id) {
              this.bot.sendMessage(id, text)
            }
          })
        })
      });
      //this.bot.sendMessage(msg.chat.id, "сообщение отправлено 123 пользователям");

    });

    this.bot.on('callback_query', async (callbackQuery) => {
      // increment counter when everytime the button is pressed
      //counter = counter + 1
      const data = callbackQuery.message;
      const command = callbackQuery.data
      const username = data.chat.username;
      console.log("callback_query", username, command);
      console.log("data", data.chat.id, data.message_id);
      const c = command.match(/^tag:(.*)$/);
      console.log("match", c);
      const nowtag = this.db.get("users").get(data.chat.username).get("nowtag");
      const t = await nowtag.then()
      if (!t) { return };
      if (c && t) {//заходим в тег 
        console.log(">>t", t?.name);//, nowtag);
        const ntag = nowtag.get("tags").get(c[1]);
        const nn = await ntag.then();
        if (nn && nn.name) {
          console.log("nowtag put", nn.name);
          //TODO копипаста, переделать нормально
          this.disconnect(username);
          nowtag.put(ntag);
          this.connect(username);
        };
      }
      if (command == "up" && t) {
        //        const nowtag = this.db.get("users").get(data.chat.username).get("nowtag");
        //        const t = await nowtag.then()
        console.log("up nowtag--", t.name, t.path, t.parent);
        //const tt = this.db.get(t);
        //console.log("tt", tt);
        if (t.parent) {
          //const up = this.db.get(t.parent);
          //this.disconnect(username);
          nowtag.put(t.parent);
          //this.connect(username);
        } else {
          this.bot.sendMessage(data.chat.id, "вы уже в корне дерева, выше некуда(").then(msg => {
            this.deleteMessageId(data.chat.id, msg.message_id);
          });
        }
      }
      if (command == "add" && t) {
        this.bot.sendMessage(data.chat.id, this.i18n.__("addtag")).then(msg => {
          this.deleteMessageId(data.chat.id, msg.message_id, 10);
        });
        this.db.get("users").get(data.chat.username).get("state").put("addtag");
        return;
      }
      //      this.bot.editMessageText(data.chat.id, data.message_id, callbackQuery.data);//, 
      try {//TODO это не здесь, а в колбэке nowtag?
        console.log("before editTagMessage");
        this.editTagMessage(data.chat.username);
        return;
        const ret = this.bot.editMessageText(callbackQuery.data,
          {
            chat_id: data.chat.id,
            message_id: data.message_id
          });
        console.log("ret=", ret)
      } catch (e) {
        console.log("error", e);
      }
    });

  }

  send(value, text, username, wave = 0) {
    console.log("send", wave, value, text);
    Object.keys(value).forEach((val) => {
      console.log("get from gun.users", val);
      const user = this.db.get("users").get(val);
      user.once((uu) => {
        console.log("uu", uu);
        if (!uu || !uu.chat) { return }//если режим чата отключен - пропускаем
        const id = uu.id;
        //const friends = uu.friends;
        if (val == username || !id) { return };
        //console.log("chat send to", val, id);
        if (id) {
          console.log("sendMessage", id, text);
          this.bot.sendMessage(id, text)
        }
      });
      if (wave < 0) {//TODO переделать через очередь в gun. тут только записывать юзерам что им надо отправить
        user.get("friends").once((val) => {
          if (!val) { console.log(val); return; }
          console.log("chat wave", wave, val);
          console.log(Object.keys(val));
          this.send(val, text, username, wave + 1);
          return;
        });
      };
    })
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
    console.log(extractedAddr, extractedTags);
    return { tags: Object.keys(extractedTags), addr: Object.keys(extractedAddr) };
  }
  async keyboard(id = "tags", tags = [], subscribe = true) {
    console.log("keyboard", id, tags);
    var tagsKeyboard = [];
    if (tags) {
      const t = await this.db.get(tags).then();
      //console.log("t==", t);
      if (t) {
        Object.keys(t).forEach(tt => {//TODO сортировка по времени поле updated?
          if (tt == '_') { return }
          tagsKeyboard.push([{ text: tt, callback_data: "tag:" + tt }]);
        })
      }
    }
    if (id == "tags") {
      return {
        reply_markup: {
          inline_keyboard: [
            [{
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
            {
              text: `🗑️`,
              callback_data: 'spam'
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
//            [
//              {
//                text: subscribe ? `🔒` : `🔓`,
//                callback_data: subscribe ? 'private' : 'public'
//              }
//            ],
            ...tagsKeyboard
          ]
        }
      }
    }
  }
}

//module.exports = Bot;
export default Bot;

class Bot {
  commands = {
    "friend": "Добавить друзей(подписаться на их сообщения)"
  };
  constructor(token, db, i18n) {
    const TelegramBot = require('node-telegram-bot-api');
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db;
    this.i18n = i18n;
  }
  start() {
    console.log("bot started");
    this.bot.onText(/\/start/gmi, (msg, match) => {
      console.log("/start", match, msg);
      //const text = this.db.get("")
      const text = "Доброе утро. Этот бот позволяет быстро и легко получать нужную информацию.\nСписок команд:\n"
        + "/friends - список друзей\n"
        + "/friends @ник1 - добавить пользователя в друзья\n"
        + "/subscribe - список сообществ\n"
        + "/subscribe #тег1 -#тег2 - подписаться/скрыть на сообщество/тег\n"
        + "/filter 1 - фильтровать сообщения по количеству цепочек доверия к человеку\n"
        + "/help - помощь типа. надеюсь её кто-нибудь когда-нибудь напишет..\n"
      //this.db.get(msg.from.username).get("friends").put({});

      const u = this.db.get("users").get(msg.from.username).put({ "id": msg.from.id });
      this.bot.sendMessage(msg.chat.id, this.i18n.__("start"));
    });
    this.bot.onText(/\/friends$/gmi, async (msg, match) => {
      return;
      console.log("<--/friends", match, msg);
      //const text = this.db.get("")
      const username = msg.from.username;
      const user = this.db.get("users").get(username);
      const friends = user.get("friends").once();
      user.get("friends").once((value, key) => {
        console.log("key->value", key, value);
        const text = "список друзей\n" + JSON.stringify(value);
        console.log("send friend list", username, text);
        //this.bot.sendMessage(msg.chat.id, text);
      });
      //console.log(friends);
      //const val = friends.once();
      //console.log(val);
      //      const text = "список друзей\n"+JSON.stringify(friends);
      //      console.log("send friend list", username, friends, text, user);
      //      this.bot.sendMessage(msg.chat.id, text);
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

    this.bot.onText(/^(.*)$/m, (msg, match) => {
      //TODO в будущем тут 3 варианта - друзья(13), друзья друзей(234), друзья друзей друзей(3423)
      //важность и охват регулируются количеством восклицательных знаков в начале !!!
      var text = match.input;
      console.log("onText", text, msg.chat, match);
      if (text.startsWith("/")) { return };//команды пропускаем

      const username = msg.from.username;
      var pretext = "";
      if (text[0] == "?") {
        text = text.slice(1);
        pretext = "?";
      } else {
        pretext = "@" + username + " ";//TODO если начинается с вопроса - то анонимно
      }
      console.log("before parse");
      var parse = this.parseString(text);
      console.log("parse", parse);
      text = pretext + text;
      const u = this.db.get("users").get(username).put({ "id": msg.from.id });
      const m = u.get("texts").set(text);
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
      parse.tags.forEach((tag) => {
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
      //и еще команда /chat_radius 10 - задает количество км, если 0 то всем.
      console.log("send to friends");
      u.get("friends").once((val) => {
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

    this.bot.on('callback_query', function onCallbackQuery(callbackQuery) {
      // increment counter when everytime the button is pressed
      //counter = counter + 1
      console.log("callback_query", callbackQuery);
    });

  }

  send(value, text, username, wave = 0) {
    console.log("send", wave, value, text);
    Object.keys(value).forEach((val) => {
      console.log("get from gun.users", val);
      const user = this.db.get("users").get(val);
      user.get("id").once((uu) => {
        console.log("uu", uu);
        if(!uu){return}
        const id = uu;
        //const friends = uu.friends;
        if (val == username || !id){return};
        //console.log("chat send to", val, id);
        if (id) {
          console.log("sendMessage", id, text);
          this.bot.sendMessage(id, text)
        }
      });
      if (wave<0){
      user.get("friends").once((val) => {
        if (!val) { console.log(val); return; }
        console.log("chat wave", wave, val);
        console.log(Object.keys(val));
        this.send(val, text, username, wave+1);
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
}

module.exports = Bot;
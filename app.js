//const DB = require("./db.js");

import DB from './db.js';
import Bot from './bot.js'
//console.log(DB);
var db = new DB();
import i18n from './i18n.config.js';
console.log("----------------", Date.now().toLocaleString());

var bot = new Bot(process.env.TOKEN, db.gun, i18n, process.env.TAGS);
bot.start();

console.log("app started");
//import { I18n } from 'i18n';

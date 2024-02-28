class DB {//класс с расчетом на использование и в браузере/вебаппе
    constructor () {
        this.GUN =new require('gun');
        this.gun = new this.GUN();
        this.data = {};
    }
    user(user){
        var ret = this.data[user];
        console.log("DB", user, ret);
        if (!ret){ ret = {"friends":{}}};
        return ret;
    }
}

module.exports = DB;

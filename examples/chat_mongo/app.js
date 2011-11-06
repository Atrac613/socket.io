/**
 * Module dependencies.
 */

var express = require('express')
  , stylus = require('stylus')
  , nib = require('nib')
  , mongoose = require('mongoose')
  , sio = require('socket.io');

/**
 * MongoDB
 */

var Schema = mongoose.Schema;

var ChatSchema = new Schema({
    nickname : { type: String }
  , msg : { type: String }
  , date : Date
});

mongoose.model('Chat', ChatSchema);
mongoose.connect('mongodb://localhost/chat_mongo');

var Chat = mongoose.model('Chat');

/**
 * App.
 */

var app = express.createServer();

/**
 * App configuration.
 */

app.configure(function () {
  app.use(stylus.middleware({ src: __dirname + '/public', compile: compile }));
  app.use(express.static(__dirname + '/public'));
  app.set('views', __dirname);
  app.set('view engine', 'jade');

  function compile (str, path) {
    return stylus(str)
      .set('filename', path)
      .use(nib());
  };
});

/**
 * App routes.
 */

app.get('/', function (req, res) {
  res.render('index', { layout: false });
});

/**
 * App listen.
 */

app.listen(3000, function () {
  var addr = app.address();
  console.log('   app listening on http://' + addr.address + ':' + addr.port);
});

/**
 * Socket.IO server (single process only)
 */

var io = sio.listen(app)
  , nicknames = {};

io.sockets.on('connection', function (socket) {
  socket.on('user message', function (msg) {
    socket.broadcast.emit('user message', socket.nickname, msg);

    // Save message to MongoDB.
    var chat = new Chat();
    chat.nickname = socket.nickname;
    chat.msg = msg;
    chat.date = new Date();
    chat.save(function(err){
      if (err) { console.log(err); }
    });

  });

  socket.on('nickname', function (nick, fn) {
    if (nicknames[nick]) {
      fn(true);
    } else {
      fn(false);
      nicknames[nick] = socket.nickname = nick;
      socket.broadcast.emit('announcement', nick + ' connected');
      io.sockets.emit('nicknames', nicknames);

      // Load message from MongoDB.
      Chat.where().desc('date').limit(10).run(function(err, docs){
        if (err) { console.log(err); }

        docs.reverse();
        for(var i=0, size=docs.length; i<size; i++){
          socket.emit('user message', docs[i].nickname, docs[i].msg);
        }
      });
    }
  });

  socket.on('disconnect', function () {
    if (!socket.nickname) return;

    delete nicknames[socket.nickname];
    socket.broadcast.emit('announcement', socket.nickname + ' disconnected');
    socket.broadcast.emit('nicknames', nicknames);
  });
});

var express = require('express')
  , app = express()
  , http = require('http')
  , Q = require('q')
  , server = http.createServer(app)
  , io = require('socket.io').listen(server);

var server_port = process.argv[2]

if (!server_port) {
	server.listen(8080)
} else {
	server.listen(server_port);
}

// routing
app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

// usernames which are currently connected to the chat
var usernames = {};

// rooms which are currently available in chat
var rooms = ['room1','room2','room3'];

var simpleUrl = /(((https|http|ftp|sftp):\/\/)?(\w+\.)+\w+(\/\w+)*\/?(\?[\w|=]*)?)/;
var imgExp = /\w*\.jpg|\.gif|\.png\b/i;
var supportedProtocols = ["http", "https", "ftp", "sftp"]; 

function harProtocol(text) {
		for (var i = 0; i < supportedProtocols.length; i++) {
			var indexOfProtocol = text.indexOf(supportedProtocols[i]);
			if (indexOfProtocol === 0) {
				return true;
			}
		}
		return false;
	}

function injectHrefs(text) {
  var match = text.match(simpleUrl);
  if (match && text.match(imgExp)) {
      text = "<img src='" + text + "'/>";
  } else if (match) {
      if (harProtocol(match[0])) {
          text = text.replace(simpleUrl, "<a href='\$1' target='_blank'>\$1</a>");
      } else {
          text = text.replace(simpleUrl, "<a href='http://\$1' target='_blank'>\$1</a>");
      }
  }
  return text;
}

function animate(text) {
	var deferred = Q.defer();
	if (text.indexOf("animate me") != -1) {
		console.log("Animate!")

		var options = {
			hostname: 'api.giphy.com',
			port: 80,
			path: '/v1/gifs/recent?api_key=dc6zaTOxFJmzC',
			method: 'GET'
		};

		var req = http.request(options, function(res) {
			console.log('STATUS: ' + res.statusCode);
			console.log('HEADERS: ' + JSON.stringify(res.headers));
			res.setEncoding('utf8');

			var data = "";

			res.on('data', function (chunk) {
				data += chunk;
			});

			res.on('end', function () {
				json = JSON.parse(data);
				var min = 0;
				var max = json.data.length;
				var random = Math.floor(Math.random() * (max - min + 1)) + min;

				image_url = json.data[random].images.original.url;
				console.log(image_url);

				deferred.resolve(text + " <img src='" + image_url + "' />");
			});

		}).end();		
	} else {
		console.log("No detect")
		deferred.resolve(text);
	}

	return deferred.promise;
}

io.sockets.on('connection', function (socket) {
	
	// when the client emits 'adduser', this listens and executes
	socket.on('adduser', function(username){
		// store the username in the socket session for this client
		socket.username = username;
		// store the room name in the socket session for this client
		socket.room = 'room1';
		// add the client's username to the global list
		usernames[username] = username;
		// send client to room 1
		socket.join('room1');
		// echo to client they've connected
		socket.emit('updatechat', 'SERVER', 'you have connected to room1');
		// echo to room 1 that a person has connected to their room
		socket.broadcast.to('room1').emit('updatechat', 'SERVER', username + ' has connected to this room');
		socket.emit('updaterooms', rooms, 'room1');
	});
	
	// when the client emits 'sendchat', this listens and executes
	socket.on('sendchat', function (data) {
		// we tell the client to execute 'updatechat' with 2 parameters
		//io.sockets.in(socket.room).emit('updatechat', socket.username, data);
		data = injectHrefs(data);
		animate(data).then(function(result) {
			io.sockets.in(socket.room).emit('updatechat', socket.username, result);
		});
	});
	
	socket.on('switchRoom', function(newroom){
		socket.leave(socket.room);
		socket.join(newroom);
		socket.emit('updatechat', 'SERVER', 'you have connected to '+ newroom);
		// sent message to OLD room
		socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username+' has left this room');
		// update socket session room title
		socket.room = newroom;
		socket.broadcast.to(newroom).emit('updatechat', 'SERVER', socket.username+' has joined this room');
		socket.emit('updaterooms', rooms, newroom);
	});
	

	// when the user disconnects.. perform this
	socket.on('disconnect', function(){
		// remove the username from global usernames list
		delete usernames[socket.username];
		// update list of users in chat, client-side
		io.sockets.emit('updateusers', usernames);
		// echo globally that this client has left
		socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
		socket.leave(socket.room);
	});
});

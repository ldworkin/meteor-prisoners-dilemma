var extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

TurkServer.Assigners.PairAssigner = (function(superClass) {
  extend(PairAssigner, superClass);

  function PairAssigner() {
    return PairAssigner.__super__.constructor.apply(this, arguments);
  }

  PairAssigner.prototype.initialize = function() {
      PairAssigner.__super__.initialize.apply(this, arguments);

      this.counter = this.setCounter();

      this.lobby.events.on("reset-lobby", (function(_this) {
	  return function() {
	      _this.counter = 0;
	      console.log('Reset counter.');
	  }
      })(this));


      this.lobby.events.on("exit-survey", (function(_this) {
	  return function() {
	      var lobbyAssts = _this.lobby.getAssignments();
	      for (var i=0; i<lobbyAssts.length; i++) {
		  var asst = lobbyAssts[i];
		  _this.lobby.pluckUsers([asst.userId]);
		  asst.showExitSurvey();
	      }
	  }
      })(this));

      this.lobby.events.on("next-game", (function(_this) {
	  return function() {
	      var started = new Date();
	      var allLobbyAssts = _this.lobby.getAssignments();
	      var lobbyAssts = _.filter(allLobbyAssts, function(asst) {
		  var statusObj = LobbyStatus.findOne(asst.userId);
		  return statusObj.status;
	      });
	      if (lobbyAssts.length > 1) { // avoid triggering by accident
		  _this.counter += 1;
		  console.log('Game: ' + _this.counter);
		  var shuffledAssts = _.shuffle(lobbyAssts);
		  // see http://stackoverflow.com/questions/8566667/split-javascript-array-in-chunks-using-underscore-js
		  var pairs = _.groupBy(shuffledAssts, function(element, index) {return Math.floor(index/2)});
		  var instances = [];
		  var leftOut = [];
		  for (var key in pairs) {
		      var assts = pairs[key];
		      if (assts.length == 2) {
			  var instance = _this.batch.createInstance(['main'])
			  instance.setup();
			  instances.push(instance.groupId);
			  for (var i=0; i<2; i++) {
			      var asst = assts[i];
			      _this.lobby.pluckUsers([asst.userId]);
			      instance.addAssignment(asst);
			  } 
		      } else {
			  leftOut.push(pairs[key][0].userId);
		      }
		  }
		  GameGroups.insert({
		      'counter': _this.counter,
		      'timestamp': started,
		      'users': _.map(lobbyAssts, function(asst) {
			  return asst.userId;
		      }),
		      'leftOut': leftOut,
		      'instances': instances
		  });
	      }
	  };
      })(this));
  };
    
 
  PairAssigner.prototype.setCounter = function() {
      var assts = Assignments.find({status: 'assigned'}).fetch();
      if (assts.length == 0) { return 0; }
      var counts = _.map(assts, function(asst) {
	  return (asst.instances && asst.instances.length) || 0;
      });
      return _.max(counts);
  }

  PairAssigner.prototype.userJoined = function(asst) {
      if (asst.getInstances().length == 0) { // first instance of the day
	  Sessions.insert({userId: asst.userId,
			   assignmentId: asst.assignmentId,
			   games: 0,
			   bonus: 0});
      } else {
	  LobbyStatus.update({_id: asst.userId}, {$set: {status: true}});
      }
      if (this.counter >= numGames) { 
	  this.lobby.pluckUsers([asst.userId]);
	  asst.showExitSurvey();
      }
  };

  return PairAssigner;

})(TurkServer.Assigner);

Meteor.methods({
    forceGoToLobby: function(instanceId) {
	TurkServer.checkAdmin();
	var inst = TurkServer.Instance.getInstance(instanceId);
	if (!inst.isEnded()) {
	    console.log('Instance has not ended yet.');
	    return;
	}
	var users = inst.users();
	_.each(users, function(user) {
	    var userGroup = Partitioner.getUserGroup(user);
	    if (userGroup != instanceId) {
		console.log('User ' + user + ' is not in that instance.');
	    } else {
		inst.sendUserToLobby(user);
		console.log('forceGoToLobby for ' + user + ' was successful.');
	    }
	})
    },
    clearUserGroups: function() {
	TurkServer.checkAdmin();
	var cleared = 0;
	Meteor.users.find({group: {$exists: true}}).forEach(function(user) {
	    cleared += 1;
	    Partitioner.clearUserGroup(user._id);
	});
	console.log(cleared + ' users groups were cleared.');
    },
    newBatch: function(name) {
	TurkServer.checkAdmin();
	Batches.upsert({name: name}, {name: name, active: true});
	var batchId = Batches.findOne({name: name})._id;
	TurkServer.Batch.getBatch(batchId).setAssigner(new TurkServer.Assigners.PairAssigner);
	Batches.update({name: name}, {$addToSet: {treatments: 'main'}});
	HITTypes.update({Title: hitTypeTitle1pm},
			{$set: {batchId: batchId}});
	HITTypes.update({Title: hitTypeTitle3pm},
			{$set: {batchId: batchId}});
    },
    getGameCount: function(name) {
	var batchId = Batches.findOne({name: name})._id;
	var batch = TurkServer.Batch.getBatch(batchId);
	var assigner = batch.assigner;
	console.log('Game counter: ' + assigner.counter);
	
    },
    setGameCount: function(name, count) {
	TurkServer.checkAdmin();
	var batchId = Batches.findOne({name: name})._id;
	var batch = TurkServer.Batch.getBatch(batchId);
	var assigner = batch.assigner;
	assigner.counter = count;
	console.log('Game counter set at: ' + assigner.counter);
    },
    payExtraBonuses: function(workerIds, amt, message, actuallyGrant) {
	TurkServer.checkAdmin();
	_.each(workerIds, function(workerId) {
	    var assignments = Assignments.find({workerId: workerId}, {sort: {acceptTime: -1}}).fetch();
	    var recentAsst = assignments[0];
	    var data = {
		WorkerId: workerId,
		AssignmentId: recentAsst.assignmentId,
		BonusAmount: {
		    Amount: amt,
		    CurrencyCode: "USD"
		},
		Reason: message
	    };
	    console.log(data);
	    if (actuallyGrant) {
		TurkServer.mturk("GrantBonus", data);
		console.log('Paid ' + workerId);
	    } else {
		console.log('Would have paid ' + workerId);
	    }
	});
    },
    payReturnedBonus: function(userId, batchName, actuallyPay) {
	TurkServer.checkAdmin();
	console.log('payReturnedBonuses');
	var workerId = Meteor.users.findOne({_id: userId}).workerId;
	var batchId = Batches.findOne({name: batchName})._id;
	var assignments = Assignments.find({workerId: workerId,
					    status: "completed"}, 
					   {sort: {acceptTime: -1}}).fetch();
	var recentAsst = assignments[0];
	var returnedAsst = Assignments.findOne({
	    workerId: workerId,
	    bonusPayment: {$gt: 0},
	    bonusPaid: {$exists: false},
	    status: "returned",
	    batchId: batchId
	});
	var amt = returnedAsst.bonusPayment.toFixed(2);
	var data = {
	    WorkerId: workerId,
	    AssignmentId: recentAsst.assignmentId,
	    BonusAmount: {
		Amount: amt,
		CurrencyCode: "USD"
	    },
	    Reason: "Bonus for today's session of the month long research study."
	};
	console.log(data);
	if (actuallyPay) {
	    TurkServer.mturk("GrantBonus", data);
	    console.log('Paid.');
	}
    },
    payBonuses: function(batchName, actuallyPay) {
	TurkServer.checkAdmin();
	console.log('payBonuses');
	var paid = 0;
	var batchId = Batches.findOne({name: batchName})._id;
	Assignments.find({
	    bonusPayment: {$gt: 0},
	    bonusPaid: {$exists: false},
	    status: "completed",
	    batchId: batchId
	}).forEach(function(asst) {
	    var asstObj = TurkServer.Assignment.getAssignment(asst._id);
	    paid += 1;
	    if (actuallyPay) {
		asstObj.payBonus("Bonus for today's session of the month long research study.");
	    }
	});
	if (actuallyPay) {
	    console.log(paid + ' Turkers were paid.');
	} else {
	    console.log(paid + ' Turkers *would have been* paid.');
	}
    },
    revokeQuals: function(time) {
	var workers = getQualified(time);
	_.each(workers, function(worker) {
	    // logic to check if we need to revoke qual
	    revokeQual(worker._id, time);
	});
    },
    getQualifiedWorkers: function(time) {
	var workers = getQualified(time);
	console.log(workers.length + ' workers have that qualification.');
    },
    emailPanel: function(emailId, time) {
	if (time == 'both') {
	    var workers = getQualified(1).concat(getQualified(3));
	} else {
	    var workers = getQualified(time);
	}
	var workerIds = _.map(workers, function(worker) {
	    return worker._id;
	});
	WorkerEmails.update({_id: emailId},
			    {$set: {recipients: workerIds}});
    },
    emailGroup: function(emailId, group) {
	WorkerEmails.update({_id: emailId},
			    {$set: {recipients: group}});
    },
    batchDiffs: function(batch1, batch2) {
	var batchId1 = Batches.findOne({name: batch1})._id;
	var batchId2 = Batches.findOne({name: batch2})._id;	
	var assts1 = Assignments.find({batchId: batchId1}).fetch();
	var assts2 = Assignments.find({batchId: batchId2}).fetch();
	var workerIds1 = _.map(assts1, function(asst) {return asst.workerId});
	var workerIds2 = _.map(assts2, function(asst) {return asst.workerId});
	var missing = _.difference(workerIds1, workerIds2);
	var qualMap = {};
	qualMap[Meteor.settings.Qual1PM] = '1PM';
	qualMap[Meteor.settings.Qual3PM] = '3PM';
	_.each(missing, function(workerId) {
	    var qual = Workers.findOne({_id: workerId}).quals[1].id;
	    console.log(workerId + ': ' + qualMap[qual]);
	});
    }
});

function getQualified(time) {
    var map = {1: Meteor.settings.Qual1PM,
	       3: Meteor.settings.Qual3PM};
    return Workers.find({
	quals: {$elemMatch: {id: map[time], value: 1}}
    }).fetch();
}


function revokeQual(workerId, time) {
    var map = {1: Meteor.settings.Qual1PM,
	       3: Meteor.settings.Qual3PM};
    var qualId = map[time];
    TurkServer.mturk('RevokeQualification', 
    		     {SubjectId: workerId,
    		      QualificationTypeId: qualId});
    Workers.update({_id: workerId},
		   {$pull: {quals: {id: qualId, value: 1}}});
}

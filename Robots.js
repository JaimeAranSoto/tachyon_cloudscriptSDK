
UpgradeRobot = function (robotInstanceId, currentPlayerId) {
    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory;
    var robotLevel = 0;

    for (var i = 0; i < inventory.length; i++) {
        if (inventory[i].ItemInstanceId == robotInstanceId) {
            if (inventory[i].CustomData != null) {
                robotLevel = inventory[i].CustomData.Level;
            }
        }
    }
    robotLevel++;
    log.debug("Level up!", robotLevel);
    server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: robotInstanceId, Data: { Level: robotLevel, UpgradeTimeStamp: -1 } });
}

handlers.RobotInstantUpgrade = function (args) {
    const robot = GetItem(args.robotInstanceId);

    if (robot == null || robot === undefined) {
        log.debug("Mech is not in player's inventory");
        return 0;
    }

    if (robot.CustomData == null) {
        // Check this custom data
        robot.CustomData = { Level: 0, UpgradeTimeStamp: -1 };
    }

    var isCurrentlyUpdating = robot.CustomData.UpgradeTimeStamp !== undefined && robot.CustomData.UpgradeTimeStamp != -1;

    if (!isCurrentlyUpdating) {
        //return -1; //Robot is not currently upgrading!
    }

    const inventoryResult = server.GetUserInventory({ PlayFabId: currentPlayerId });

    const TACHYON = "TK";
    const playerTachyon = inventoryResult.VirtualCurrency[TACHYON];

    const json = server.GetTitleData({ Keys: ["robotUpgradeCost"] }).Data.robotUpgradeCost;
    const cost = JSON.parse(json);

    const tachyonCost = (cost[robot.CustomData.Level].time / 60) * 10;
    log.debug("Tachyon cost: " + tachyonCost);

    if (playerTachyon < tachyonCost) {
        log.debug("User has not enough Tachyon");
        return -2;
    }

    UpgradeRobot(args.robotInstanceId, currentPlayerId);
    server.SubtractUserVirtualCurrency({ Amount: tachyonCost, PlayFabId: currentPlayerId, VirtualCurrency: TACHYON });
    log.debug("Mech upgraded successfully");
    return 1;
}

handlers.RobotStandardUpgrade = function (args) {
    const robot = GetItem(args.robotInstanceId);

    if (robot == null || robot === undefined) {
        log.debug("Robot is not in player's inventory");
        return 0;
    }

    var isCurrentlyUpdating = robot.CustomData.UpgradeTimeStamp !== undefined && robot.CustomData.UpgradeTimeStamp != -1;

    if (isCurrentlyUpdating) {
        log.debug("Robot was currently upgrading");
        return -3; //Robot is currently upgrading!
    }

    server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: args.robotInstanceId, Data: { UpgradeTimeStamp: Date.now() } });

    handlers.UpdateRobotStandardUpgrade({ robotInstanceId: args.robotInstanceId });

    log.debug("Robot upgrade started.");
    return 1;
}

handlers.UpdateRobotStandardUpgrade = function (args) {
    var robotInstanceId = args.robotInstanceId;

    var robot = GetItem(robotInstanceId);

    if (robot === undefined || robot == null) {
        log.debug("Mech is not in player's inventory");
        return null;
    }

    if (robot.CustomData === undefined || Object.keys(robot.CustomData).length === 0) { //Fill CustomData if it's empty.
        server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: robotInstanceId, Data: { Level: 0 } }); // Check if this is correct
    }

    var isCurrentlyUpdating = robot.CustomData.UpgradeTimeStamp !== undefined && robot.CustomData.UpgradeTimeStamp >= 0;
    var upgradeTimeStamp = -1; //Default if it's not currently upgrading

    if (isCurrentlyUpdating) {

        upgradeTimeStamp = parseInt(robot.CustomData.UpgradeTimeStamp);
        var json = server.GetTitleData({ Keys: ["robotUpgradeCost"] }).Data.upgradeCost;
        var cost = JSON.parse(json);

        var timeToUpgradeRobot = cost[robot.CustomData.Level].time * 60000; //minutes -> milliseconds

        log.debug("Time needed to upgrade the robot", timeToUpgradeRobot);
        log.debug("Time that has passed since upgrade start", Date.now() - upgradeTimeStamp);

        if (Date.now() - upgradeTimeStamp >= timeToUpgradeRobot) {
            UpgradeRobot(robotInstanceId, currentPlayerId);
            log.debug("Enough time has passed, the robot will be upgraded!");
            server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: robotInstanceId, Data: { UpgradeTimeStamp: -1 } });
        }else{
            log.debug("Not enough time has passed, the robot will not be upgraded yet!");
        }

        var timeRemaining = timeToUpgradeRobot - (Date.now() - upgradeTimeStamp);
        if (timeRemaining < 0) timeRemaining = -1;
        return timeRemaining;
    } else {
        log.debug("Robot is not upgrading!");
        return null;
    }
}

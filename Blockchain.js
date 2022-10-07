////////////// BLOCKCHAIN

handlers.PurchaseItem = function (args) {
    var PlayFabId = args.PlayFabId;
    var tokenAmount = args.tokenAmount;
    var gemAmount = args.gemAmount;
    var packId = args.packId;
    var type = args.type;
    var transactionHash = args.transactionHash;

    /* EXAMPLE:
    {
        "PlayFabId": "C13ABC128B3492CD",
        "tokenAmount": 247.00000000,
        "gemAmount": 80.00000000,
        "packId": 1,
        "type": "ON_CHAIN",
        "transactionHash": "0x8e34e52401b29cf09da424429591ae3321d3cb54ade858e80b992f447fac684e"
    }
    */

    log.debug("Purchase Item request received.")
    return "Purchase received, PlayFabId: " + PlayFabId;
}
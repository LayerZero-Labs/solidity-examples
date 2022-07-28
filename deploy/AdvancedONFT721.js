const LZ_ENDPOINTS = require("../constants/layerzeroEndpoints.json")
// const AONFT_ARGS = require("../constants/advancedOnftArgs.json")
const GREG_ARGS = require("../constants/testGregArgs.json")

module.exports = async function ({ deployments, getNamedAccounts }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    console.log(`>>> your address: ${deployer}`)

    const lzEndpointAddress = LZ_ENDPOINTS[hre.network.name]
    const aonftArgs = GREG_ARGS[hre.network.name]
    console.log({ aonftArgs })
    console.log(`[${hre.network.name}] LayerZero Endpoint address: ${lzEndpointAddress}`)

    await deploy("AdvancedONFT721", {
        from: deployer,
        args: [
            aonftArgs.name,
            aonftArgs.symbol,
            lzEndpointAddress,
            aonftArgs.startMintId,
            aonftArgs.endMintId,
            aonftArgs.maxTokensPerMint,
            aonftArgs.baseTokenURI,
            aonftArgs.hiddenURI,
        ],
        log: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["AdvancedONFT721"]

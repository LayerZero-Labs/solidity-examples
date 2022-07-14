const CHAIN_ID = require("../constants/chainIds.json")
const { getDeploymentAddresses } = require("../utils/readStatic")
const OFT_CONFIG = require("../constants/oftConfig.json")

module.exports = async function (taskArgs, hre) {
    let signers = await ethers.getSigners()
    let owner = signers[0]
    let tx
    const dstChainId = CHAIN_ID[taskArgs.targetNetwork]
    const qty = ethers.utils.parseEther(taskArgs.qty)

    let srcContractName = "ExampleOFT20"
    let dstContractName = srcContractName
    if (taskArgs.targetNetwork == OFT_CONFIG.baseChain) {
        dstContractName = "ExampleBasedOFT20"
    }
    if (hre.network.name == OFT_CONFIG.baseChain) {
        srcContractName = "ExampleBasedOFT20"
    }

    // the destination contract address
    const dstAddr = getDeploymentAddresses(taskArgs.targetNetwork)[dstContractName]
    // get source contract instance
    const basedOFT = await ethers.getContract(srcContractName)
    console.log(`[source] address: ${basedOFT.address}`)

    tx = await (await basedOFT.approve(basedOFT.address, qty)).wait()
    console.log(`approve tx: ${tx.transactionHash}`)

    let adapterParams = ethers.utils.solidityPack(["uint16", "uint256"], [1, 200000]) // default adapterParams example

    tx = await (
        await basedOFT.sendFrom(
            owner.address,
            dstChainId, // destination LayerZero chainId
            owner.address, // the 'to' address to send tokens
            qty, // the amount of tokens to send (in wei)
            owner.address, // the refund address (if too much message fee is sent, it gets refunded)
            ethers.constants.AddressZero,
            adapterParams,
            { value: ethers.utils.parseEther("1") } // estimate/guess 1 eth will cover
        )
    ).wait()
    console.log(`✅ Message Sent [${hre.network.name}] sendTokens() to OFT @ LZ chainId[${dstChainId}] token:[${dstAddr}]`)
    console.log(` tx: ${tx.transactionHash}`)
    console.log(`* check your address [${owner.address}] on the destination chain, in the ERC20 transaction tab !"`)
}

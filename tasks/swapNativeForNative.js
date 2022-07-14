const CHAIN_ID = require('../constants/chainIds.json')
const {getDeploymentAddresses} = require('../utils/readStatic')

module.exports = async function (taskArgs, hre) {
    console.log(taskArgs)

    let signers = await ethers.getSigners()
    let owner = signers[0]
    console.log(`owner: ${owner.address}`)

    const dstChainId = CHAIN_ID[taskArgs.targetNetwork]
    const dstStargateComposedAddr = getDeploymentAddresses(taskArgs.targetNetwork)["StargateComposed"]
    console.log(`dstStargateComposedAddr: ${dstStargateComposedAddr}`)

    // get local contract instance
    const stargateComposed = await ethers.getContract("StargateComposed")
    console.log(`[source] stargateComposed.address: ${stargateComposed.address}`)


    let qty = ethers.utils.parseEther(taskArgs.qty) // convert to wei
    let deadline = parseInt(new Date().getTime() / 1000) + 1000
    let tx = await( await stargateComposed.swapNativeForNative(
        dstChainId,
        taskArgs.bridgeToken,
        taskArgs.srcPoolId,
        taskArgs.dstPoolId,
        qty,
        owner.address,
        0,
        0,
        0,
        deadline,
        dstStargateComposed,
        { value: ethers.utils.parseEther('1') }
    )).wait()
    console.log(`tx: ${tx.transactionaHash}`)
}

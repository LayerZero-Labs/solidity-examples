module.exports = async function (taskArgs, hre) {
	const advancedONFT = await ethers.getContract("AdvancedONFT721")
	console.log(`[source] AdvancedONFT721.address: ${advancedONFT.address}`)

	// reveal metadata
	try {
    	let tx = await (await advancedONFT.flipRevealed()).wait()
    	console.log(`✅ [${hre.network.name}] flipRevealed()`)
    	console.log(` tx: ${tx.transactionHash}`)
  	} catch (e) {
      	console.log(e)
  	}
}
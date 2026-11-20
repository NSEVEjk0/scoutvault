import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MobileWalletProvider, useMobileWallet } from '@wallet-ui/react-native-web3js';
import { VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { readBridgeRequest, type BridgeRequest } from './src/bridge';

const extra = Constants.expoConfig?.extra ?? {};
const webOrigin = String(extra.webOrigin ?? 'https://scoutvault-checks.vercel.app');
const endpoint = String(extra.rpcEndpoint ?? 'https://api.devnet.solana.com');
const identity = { name: 'ScoutVault', uri: webOrigin, icon: 'scoutvault.svg' };
type CaptureResult = { base64: string; latitude: number; longitude: number; accuracy: number; capturedAt: string };

export default function App() {
  return <SafeAreaProvider><MobileWalletProvider chain="solana:devnet" endpoint={endpoint} identity={identity}><ScoutVaultPhone /></MobileWalletProvider></SafeAreaProvider>;
}

function ScoutVaultPhone() {
  const wallet = useMobileWallet();
  const walletRef = useRef(wallet); walletRef.current = wallet;
  const web = useRef<WebView<{}>>(null);
  const camera = useRef<CameraView>(null);
  const [permission, requestCameraPermission] = useCameraPermissions();
  const [capture, setCapture] = useState<{ code: string; instruction: string } | null>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const capturePromise = useRef<{ resolve: (value: CaptureResult) => void; reject: (error: Error) => void } | null>(null);
  const opacity = useSharedValue(0);
  useEffect(() => { opacity.value = withSpring(capture ? 1 : 0, { stiffness: 400, damping: 35, overshootClamping: true, reduceMotion: ReduceMotion.System }); }, [capture]);
  const captureStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: (1 - opacity.value) * 12 }] }));

  const position = async () => {
    const consent = await Location.requestForegroundPermissionsAsync();
    if (!consent.granted) throw new Error('Allow location access to attach this field report.');
    const value = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: value.coords.latitude, longitude: value.coords.longitude, accuracy: value.coords.accuracy ?? 100 };
  };

  const run = async (request: BridgeRequest): Promise<unknown> => {
    const params = request.params;
    if (request.method === 'connect') {
      await walletRef.current.connect();
      for (let attempt = 0; attempt < 30; attempt++) {
        const account = walletRef.current.account;
        if (account) return { wallet: account.address.toBase58() };
        await new Promise(resolve => setTimeout(resolve,50));
      }
      throw new Error('The wallet did not return an account. Please connect again.');
    }
    if (request.method === 'disconnect') { await walletRef.current.disconnect(); return true; }
    if (request.method === 'signMessage') {
      if (typeof params.message !== 'string' || params.message.length > 15000) throw new Error('Invalid signing message.');
      const signature = await walletRef.current.signMessages(new TextEncoder().encode(params.message));
      return Buffer.from(signature).toString('base64');
    }
    if (request.method === 'sendTransaction') {
      if (typeof params.transaction !== 'string' || params.transaction.length > 5000 || typeof params.minContextSlot !== 'number') throw new Error('Invalid transaction request.');
      const transaction = VersionedTransaction.deserialize(Buffer.from(params.transaction,'base64'));
      return walletRef.current.signAndSendTransactions(transaction,params.minContextSlot);
    }
    if (request.method === 'getLocation') return position();
    if (request.method === 'capture') {
      const consent = permission?.granted ? permission : await requestCameraPermission();
      if (!consent.granted) throw new Error('Allow camera access to capture your field report.');
      if (capturePromise.current) throw new Error('A camera capture is already open.');
      setCapture({ code: String(params.code ?? ''), instruction: String(params.instruction ?? 'Capture the requested feature where photography is permitted.') });
      return new Promise<CaptureResult>((resolve,reject) => { capturePromise.current = { resolve,reject }; });
    }
    if (request.method === 'speak') {
      if (typeof params.text !== 'string' || params.text.length > 5000) throw new Error('Invalid audio brief.');
      Speech.stop();
      const voices = await Speech.getAvailableVoicesAsync();
      const voice = voices.find(item => item.language.startsWith('en'));
      Speech.speak(params.text,{ language:'en',rate:0.95,...(voice?{voice:voice.identifier}:{}) });return true;
    }
    if (request.method === 'stopSpeech') { Speech.stop(); return true; }
    throw new Error('Unsupported app request.');
  };

  const receive = async (event: WebViewMessageEvent) => {
    let request: BridgeRequest | undefined;
    try {
      request = readBridgeRequest(event.nativeEvent.data,event.nativeEvent.url,webOrigin);
      const result = await run(request);
      web.current?.injectJavaScript(`window.__scoutvaultReceive?.(${JSON.stringify({ id:request.id,result })});true;`);
    } catch (error) {
      if (request) web.current?.injectJavaScript(`window.__scoutvaultReceive?.(${JSON.stringify({ id:request.id,error:error instanceof Error?error.message:'The phone could not complete this request.' })});true;`);
    }
  };

  const cancelCapture = () => { capturePromise.current?.reject(new Error('Camera capture cancelled.')); capturePromise.current = null; setCapture(null); };
  const takePhoto = async () => {
    if (!camera.current || !capturePromise.current) return;
    setTakingPhoto(true);
    try {
      const location = await position();
      const picture = await camera.current.takePictureAsync({ base64:true,quality:0.8,exif:false });
      if (!picture?.base64) throw new Error('The camera photo could not be saved.');
      capturePromise.current.resolve({ base64:picture.base64,...location,capturedAt:new Date().toISOString() });
      capturePromise.current = null; setCapture(null);
    } catch (error) { Alert.alert('Photo not saved',error instanceof Error?error.message:'Try again.'); }
    finally { setTakingPhoto(false); }
  };

  return <SafeAreaView style={styles.root} edges={['top','bottom']}><StatusBar style="dark" />
    {loadError ? <View style={styles.error}><Text style={styles.title}>ScoutVault could not connect.</Text><Text style={styles.caption}>Check your internet connection, then retry. Your wallet stays in the wallet app.</Text><Pressable style={styles.action} onPress={() => { setLoadError(false); web.current?.reload(); }}><Text style={styles.actionText}>Retry</Text></Pressable></View> : <WebView<{}> ref={web} source={{uri:webOrigin}} style={styles.web} onMessage={receive} onError={() => setLoadError(true)} injectedJavaScriptBeforeContentLoaded="window.__SCOUTVAULT_NATIVE__=true;true;" originWhitelist={[webOrigin]} javaScriptEnabled domStorageEnabled geolocationEnabled={false} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction setSupportMultipleWindows={false} onShouldStartLoadWithRequest={request => {
      try { if (new URL(request.url).origin === new URL(webOrigin).origin) return true; }
      catch { return request.url === 'about:blank'; }
      if (/^https?:\/\//.test(request.url)) void Linking.openURL(request.url); return false;
    }} startInLoadingState renderLoading={() => <View style={styles.loading}><ActivityIndicator color="#164f40" /><Text style={styles.caption}>Opening ScoutVault…</Text></View>} />}
    <Modal visible={!!capture} animationType="none" onRequestClose={cancelCapture}><SafeAreaView style={styles.captureRoot}><Animated.View style={[styles.captureContent,captureStyle]}><View style={styles.captureHeader}><Text style={styles.captureTitle}>Fresh field capture</Text><Pressable accessibilityRole="button" accessibilityLabel="Cancel camera capture" onPress={cancelCapture} style={styles.close}><Text style={styles.caption}>Cancel</Text></Pressable></View><View style={styles.instruction}><Text style={styles.code}>{capture?.code}</Text><Text style={styles.caption}>{capture?.instruction}</Text></View><CameraView ref={camera} style={styles.camera} facing="back" /><Text style={styles.privacy}>Include only the requested place or feature. Leave out faces and private belongings.</Text><Pressable style={styles.shutter} disabled={takingPhoto} accessibilityRole="button" onPress={() => void takePhoto()}><Text style={styles.actionText}>{takingPhoto ? 'Saving photo…' : 'Take photo and attach location'}</Text></Pressable></Animated.View></SafeAreaView></Modal>
  </SafeAreaView>;
}

const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#f7f8f4'},web:{flex:1,backgroundColor:'#f7f8f4'},loading:{position:'absolute',top:0,right:0,bottom:0,left:0,justifyContent:'center',alignItems:'center',gap:12,backgroundColor:'#f7f8f4'},error:{flex:1,justifyContent:'center',alignItems:'center',padding:28,gap:16},title:{fontSize:22,fontWeight:'600',color:'#243e2e',textAlign:'center'},caption:{fontSize:14,lineHeight:22,color:'#617262'},action:{minHeight:48,paddingHorizontal:22,paddingVertical:14,borderRadius:9,backgroundColor:'#164f40'},actionText:{fontSize:14,fontWeight:'600',color:'#fff',textAlign:'center'},captureRoot:{flex:1,backgroundColor:'#f7f8f4'},captureContent:{flex:1,padding:20,gap:16},captureHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},captureTitle:{fontSize:21,fontWeight:'600',color:'#24432f'},close:{minHeight:44,justifyContent:'center',padding:8},instruction:{backgroundColor:'#eaf0dc',padding:16,borderRadius:10,gap:8},code:{fontSize:23,fontWeight:'700',color:'#164f40'},camera:{flex:1,borderRadius:12,overflow:'hidden'},privacy:{fontSize:12,lineHeight:19,color:'#7c8c72'},shutter:{backgroundColor:'#164f40',borderRadius:10,padding:16,minHeight:50}});

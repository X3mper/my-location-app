import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

// Генерация случайного 8-значного пароля
const generatePassword = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

// Главный компонент приложения
function App() {
  // Состояние для Firebase
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Состояние для режима приложения: 'initial', 'sharer', 'viewer'
  const [mode, setMode] = useState('initial'); // 'initial', 'sharer', 'viewer'

  // Состояние для шаринга (дедушка)
  const [sharerLatitude, setSharerLatitude] = useState(null);
  const [sharerLongitude, setSharerLongitude] = useState(null);
  const [sharingPassword, setSharingPassword] = useState('');
  const [isSharingActive, setIsSharingActive] = useState(false);
  const [sharerMessage, setSharerMessage] = useState('');
  const [watchId, setWatchId] = useState(null); // ID для watchPosition

  // Состояние для просмотра (бабушка)
  const [viewerPassword, setViewerPassword] = useState('');
  const [viewerLatitude, setViewerLatitude] = useState(null);
  const [viewerLongitude, setViewerLongitude] = useState(null);
  const [viewerMessage, setViewerMessage] = useState('');
  const [viewerGoogleMapsLink, setViewerGoogleMapsLink] = useState('');
  const [isWatchingLocation, setIsWatchingLocation] = useState(false);

  // Инициализация Firebase и аутентификация
  useEffect(() => {
    try {
     const firebaseConfig = {
  apiKey: "AIzaSyADmbFY5ornKfgFuJ2pBpBsugbbIv3-i0Y",
  authDomain: "my-location-app-7c46c.firebaseapp.com",
  projectId: "my-location-app-7c46c",
  storageBucket: "my-location-app-7c46c.firebasestorage.app",
  messagingSenderId: "907501247122",
  appId: "1:907501247122:web:d39d93f2dbf1e77741644b",
  measurementId: "G-NLCTMGQLJH"
};
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
  if (user) {
    setUserId(user.uid);
  } else {
    // Входим анонимно
    await signInAnonymously(firebaseAuth);
    setUserId(firebaseAuth.currentUser?.uid || crypto.randomUUID());
  }
  setIsAuthReady(true);
});
      return () => unsubscribe();
    } catch (error) {
      console.error("Ошибка инициализации Firebase:", error);
      setSharerMessage("Ошибка инициализации приложения. Попробуйте перезагрузить страницу.");
      setViewerMessage("Ошибка инициализации приложения. Попробуйте перезагрузить страницу.");
    }
  }, []);

  // Функция для обновления местоположения в Firestore
  const updateLocationInFirestore = useCallback(async (lat, lon, password) => {
    if (!db || !userId || !password) {
      console.log("Firestore или userId не готовы, или пароль отсутствует.");
      return;
    }
    const appId = 'my-location-app-id'; 
    const docRef = doc(db, `artifacts/${appId}/public/data/sharedLocations`, password); // Используем пароль как ID документа

    try {
      await setDoc(docRef, {
        userId: userId,
        latitude: lat,
        longitude: lon,
        timestamp: Date.now(),
        active: true,
        password: password // Сохраняем пароль в документе для поиска
      }, { merge: true }); // Используем merge, чтобы обновлять, если документ уже существует
      setSharerMessage(`Местоположение обновлено. Пароль: ${password}`);
    } catch (e) {
      console.error("Ошибка записи местоположения в Firestore:", e);
      setSharerMessage("Ошибка: Не удалось обновить местоположение.");
    }
  }, [db, userId]);

  // Функция для начала отслеживания местоположения (для дедушки)
  const startLocationSharing = useCallback(() => {
    if (!isAuthReady || !db || !userId) {
      setSharerMessage("Приложение еще не готово. Пожалуйста, подождите.");
      return;
    }

    setSharerMessage('Запрашиваю местоположение...');
    const newPassword = generatePassword();
    setSharingPassword(newPassword);
    setIsSharingActive(true);

    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setSharerLatitude(lat);
          setSharerLongitude(lon);
          updateLocationInFirestore(lat, lon, newPassword);
        },
        (error) => {
          setIsSharingActive(false);
          setSharerMessage(`Ошибка: ${error.message}. Пожалуйста, разрешите доступ к местоположению.`);
          console.error("Ошибка watchPosition:", error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
      setWatchId(id);
      setSharerMessage(`Делимся местоположением. Ваш пароль: ${newPassword}`);
    } else {
      setSharerMessage('Ваш браузер не поддерживает Geolocation API.');
      setIsSharingActive(false);
    }
  }, [isAuthReady, db, userId, updateLocationInFirestore]);

  // Функция для остановки отслеживания местоположения (для дедушки)
  const stopLocationSharing = useCallback(async () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsSharingActive(false);
    setSharerLatitude(null);
    setSharerLongitude(null);
    setSharerMessage('Передача местоположения остановлена.');

    // Отметить документ как неактивный в Firestore
    if (db && sharingPassword) {
      const appId = 'my-location-app-id';
      const docRef = doc(db, `artifacts/${appId}/public/data/sharedLocations`, sharingPassword);
      try {
        await setDoc(docRef, { active: false }, { merge: true });
      } catch (e) {
        console.error("Ошибка при остановке шаринга в Firestore:", e);
      }
    }
  }, [watchId, db, sharingPassword]);

  // Функция для просмотра местоположения (для бабушки)
  const viewLocation = useCallback(async () => {
    if (!db || !isAuthReady) {
      setViewerMessage("Приложение еще не готово. Пожалуйста, подождите.");
      return;
    }
    if (!viewerPassword) {
      setViewerMessage("Пожалуйста, введите пароль.");
      return;
    }

    setIsWatchingLocation(true);
    setViewerMessage('Ищу местоположение...');
    setViewerGoogleMapsLink('');

    const appId = 'my-location-app-id';
    const docRef = doc(db, `artifacts/${appId}/public/data/sharedLocations`, viewerPassword);

    // Слушаем изменения в документе в реальном времени
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().active) {
        const data = docSnap.data();
        setViewerLatitude(data.latitude);
        setViewerLongitude(data.longitude);
        const link = `https://maps.google.com/?q=${data.latitude},${data.longitude}`;
        setViewerGoogleMapsLink(link);
        setViewerMessage(`Местоположение найдено! Последнее обновление: ${new Date(data.timestamp).toLocaleTimeString()}`);
      } else {
        setViewerMessage('Местоположение не найдено или передача остановлена. Проверьте пароль.');
        setViewerLatitude(null);
        setViewerLongitude(null);
        setViewerGoogleMapsLink('');
        setIsWatchingLocation(false);
        // Отписываемся, если документ не существует или неактивен
        if (unsubscribe) unsubscribe();
      }
    }, (error) => {
      console.error("Ошибка при получении данных из Firestore:", error);
      setViewerMessage("Ошибка при получении местоположения. Попробуйте еще раз.");
      setIsWatchingLocation(false);
      if (unsubscribe) unsubscribe();
    });

    // Возвращаем функцию отписки, чтобы очистить слушатель при размонтировании или изменении пароля
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [db, isAuthReady, viewerPassword]);

  // UI для выбора режима
  if (mode === 'initial') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center p-4 font-inter">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md text-center transform transition-all duration-300 hover:scale-105">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            <span role="img" aria-label="Location Pin" className="mr-2">📍</span>
            Выберите режим
          </h1>
          <button
            onClick={() => setMode('sharer')}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 mb-4"
          >
            Делиться местоположением
          </button>
          <button
            onClick={() => setMode('viewer')}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
          >
            Просмотреть местоположение
          </button>
          {userId && (
            <p className="text-gray-500 text-xs mt-4">
              Ваш ID пользователя: <span className="font-mono break-all">{userId}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  // UI для режима шаринга
  if (mode === 'sharer') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center p-4 font-inter">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md text-center transform transition-all duration-300 hover:scale-105">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            <span role="img" aria-label="Share Icon" className="mr-2">⬆️</span>
            Режим передачи местоположения
          </h1>
          <p className="text-gray-600 mb-6 text-lg">
            {sharerMessage}
          </p>

          {!isSharingActive ? (
            <button
              onClick={startLocationSharing}
              disabled={!isAuthReady}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              Начать делиться
            </button>
          ) : (
            <>
              <div className="bg-yellow-100 text-yellow-800 p-4 rounded-lg mb-4 text-xl font-bold break-all">
                Пароль: {sharingPassword}
              </div>
              <p className="text-gray-700 text-sm mb-4">
                Сообщите этот пароль другому человеку для просмотра.
              </p>
              {sharerLatitude && sharerLongitude && (
                <div className="bg-gray-100 p-4 rounded-lg mb-4 text-left">
                  <p className="text-gray-700 text-sm mb-2">
                    <span className="font-semibold">Широта:</span> {sharerLatitude.toFixed(6)}
                  </p>
                  <p className="text-gray-700 text-sm">
                    <span className="font-semibold">Долгота:</span> {sharerLongitude.toFixed(6)}
                  </p>
                </div>
              )}
              <button
                onClick={stopLocationSharing}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 mb-4"
              >
                Остановить передачу местоположения
              </button>
            </>
          )}
          <button
            onClick={() => {
              stopLocationSharing(); // Останавливаем шаринг при смене режима
              setMode('initial');
            }}
            className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-opacity-75"
          >
            Вернуться к выбору режима
          </button>
        </div>
      </div>
    );
  }

  // UI для режима просмотра
  if (mode === 'viewer') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center p-4 font-inter">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md text-center transform transition-all duration-300 hover:scale-105">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            <span role="img" aria-label="Eye Icon" className="mr-2">👀</span>
            Режим просмотра местоположения
          </h1>
          <p className="text-gray-600 mb-6 text-lg">
            {viewerMessage}
          </p>

          <input
            type="text"
            placeholder="Введите пароль..."
            value={viewerPassword}
            onChange={(e) => setViewerPassword(e.target.value.toUpperCase())}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-center text-lg focus:ring-blue-500 focus:border-blue-500"
            maxLength="8"
          />

          {!isWatchingLocation ? (
            <button
              onClick={viewLocation}
              disabled={!isAuthReady || !viewerPassword}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              Просмотреть местоположение
            </button>
          ) : (
            <button
              onClick={() => {
                setIsWatchingLocation(false);
                setViewerLatitude(null);
                setViewerLongitude(null);
                setViewerGoogleMapsLink('');
                setViewerMessage('Просмотр местоположения остановлен.');
              }}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 mb-4"
            >
              Остановить просмотр
            </button>
          )}

          {viewerGoogleMapsLink && (
            <div className="mt-6">
              <p className="text-gray-700 mb-2">
                Местоположение:
              </p>
              <a
                href={viewerGoogleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-purple-100 text-purple-700 p-3 rounded-lg break-words text-sm hover:underline transition duration-200"
              >
                {viewerGoogleMapsLink}
              </a>
              <p className="text-gray-500 text-xs mt-2">
                Нажмите на ссылку, чтобы открыть её в Google Картах.
              </p>
            </div>
          )}
          <button
            onClick={() => setMode('initial')}
            className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-opacity-75 mt-4"
          >
            Вернуться к выбору режима
          </button>
        </div>
      </div>
    );
  }
}

export default App;
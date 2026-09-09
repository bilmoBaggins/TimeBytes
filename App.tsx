import { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { initializeDatabase, closeDatabase } from "./src/database/database";
import { initializeEmployees } from "./src/database/employees";
import ClockScreen from "./src/screens/ClockScreen";
import AdminScreen from "./src/screens/AdminScreen";
import { initializeCloudSync, syncLocalDatabase } from "./src/cloud/sync";
import BrandLogo from "./src/components/BrandLogo";

const Tab = createBottomTabNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function setupApp() {
      try {
        await initializeDatabase();
        await initializeEmployees();
        try {
          await initializeCloudSync();
          await syncLocalDatabase();
        } catch (cloudError) {
          console.warn("Cloud backup unavailable; continuing offline:", cloudError);
        }
        setIsReady(true);
      } catch (err) {
        console.error("Failed to initialize app:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    setupApp();

    // Tablets stay open for a whole shift; periodically re-push so a clock-in
    // that missed its one-shot background sync (e.g. brief network drop)
    // still reaches the dashboard without requiring another action.
    const resyncInterval = setInterval(() => {
      syncLocalDatabase().catch((error) => {
        console.warn("Periodic cloud sync failed; will retry:", error);
      });
    }, 60000);

    return () => {
      clearInterval(resyncInterval);
      closeDatabase();
    };
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FBF3EC" }}>
        <BrandLogo width={300} />
        <ActivityIndicator size="large" color="#F28C00" />
        <Text style={{ marginTop: 12, color: "#8A7A70", fontWeight: "600" }}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FBF3EC" }}>
        <Text style={{ color: "#B85F00", fontSize: 16, fontWeight: "700", textAlign: "center" }}>Something went wrong</Text>
        <Text style={{ color: "#8A7A70", fontSize: 14, textAlign: "center", marginTop: 6 }}>{error}</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            tabBarActiveTintColor: "#F28C00",
            tabBarInactiveTintColor: "#85898C",
            tabBarLabelStyle: { fontSize: 14, fontWeight: "700", marginTop: 0 },
            tabBarItemStyle: { justifyContent: "center", alignItems: "center" },
            tabBarIconStyle: { display: "none", width: 0, height: 0, margin: 0 },
            tabBarStyle: {
              backgroundColor: "white",
              borderTopColor: "#E3DED7",
              height: 56,
              paddingBottom: 0,
              paddingTop: 0,
            },
            headerStyle: { backgroundColor: "#85898C" },
            headerTintColor: "white",
            headerTitleStyle: { fontWeight: "700" },
          }}
        >
          <Tab.Screen
            name="Clock"
            component={ClockScreen}
            options={{
              tabBarLabel: "Clock",
              headerShown: false,
            }}
          />
          <Tab.Screen
            name="Admin"
            component={AdminScreen}
            options={{
              tabBarLabel: "Payroll",
              headerShown: false,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}
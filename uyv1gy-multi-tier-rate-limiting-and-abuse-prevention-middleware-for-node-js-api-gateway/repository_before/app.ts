type Request = {
  path: string;
  ip: string;
  userId?: string;
  payload?: Record<string, any>;
};

type Response = {
  status: number;
  data?: any;
};

class WeatherService {
  getCurrentWeather(city: string) {
    return { city, temp: 22, status: "sunny" };
  }
}

class AuthService {
  login(username: string, passwordHash: string): boolean {
    return username === "admin" && passwordHash === "secret";
  }
}

export class APIServer {
  private weather = new WeatherService();
  private auth = new AuthService();

  handleRequest(req: Request): Response {
    if (req.path === "/login") {
      const ok = this.auth.login(
        req.payload?.user,
        req.payload?.pwd
      );
      return { status: ok ? 200 : 401 };
    }

    if (req.path.startsWith("/weather")) {
      return {
        status: 200,
        data: this.weather.getCurrentWeather("London")
      };
    }

    return { status: 404 };
  }
}

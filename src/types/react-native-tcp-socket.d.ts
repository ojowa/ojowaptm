declare module 'react-native-tcp-socket' {
  export interface Socket {
    connect(options: { host: string; port: number; tls?: boolean }): Socket;
    write(data: ArrayBuffer | string): void;
    destroy(): void;
    setNoDelay(enable: boolean): void;
    on(event: 'connect', listener: () => void): this;
    on(event: 'data', listener: (data: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: (hadError: boolean) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
  }

  export interface Server {
    listen(options: { port: number; host?: string }, callback?: () => void): void;
    close(): void;
    on(event: 'connection', listener: (socket: Socket) => void): this;
  }

  const TcpSocket: {
    createConnection(options: { host: string; port: number; tls?: boolean }, callback?: () => void): Socket;
    createServer(options?: any, connectionListener?: (socket: Socket) => void): Server;
    connect(options: { host: string; port: number; tls?: boolean }, callback?: () => void): Socket;
    isIP(input: string): 0 | 4 | 6;
    isIPv4(input: string): boolean;
    isIPv6(input: string): boolean;
    Socket: new () => Socket;
    Server: new () => Server;
  };

  export default TcpSocket;
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql, { type Pool, type PoolOptions, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

/** Bindable placeholder value types mysql2 accepts for a parameterized query. */
export type QueryParams = (string | number | boolean | Date | Buffer | null)[];

/**
 * Raw mysql2 connection pool wrapper — replaces PrismaClient/PrismaService.
 * Every query is parameterized (never string-concatenated) per the
 * database skill's security standard. Pool sizing/lifecycle mirrors what
 * PrismaService did (@Global module, connect on init, drain on destroy).
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const options = this.parseConnectionOptions(this.config.get<string>('DATABASE_URL'));
    this.pool = mysql.createPool({
      ...options,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: false,
    });
    // Fail fast on boot if the DB is unreachable, rather than surfacing on
    // the first request.
    const conn = await this.pool.getConnection();
    conn.release();
    this.logger.log('MySQL pool connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  /** Parses a mysql://user:pass@host:port/db URL into mysql2 pool options. */
  private parseConnectionOptions(databaseUrl: string | undefined): PoolOptions {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
    };
  }

  /** Runs a parameterized SELECT and returns the rows, typed by the caller. */
  async query<T extends RowDataPacket[]>(sql: string, params: QueryParams = []): Promise<T> {
    const [rows] = await this.pool.query<T>(sql, params);
    return rows;
  }

  /** Runs a parameterized INSERT/UPDATE/DELETE and returns the result metadata (insertId, affectedRows). */
  async execute(sql: string, params: QueryParams = []): Promise<ResultSetHeader> {
    const [result] = await this.pool.execute<ResultSetHeader>(sql, params);
    return result;
  }

  /**
   * Runs `fn` inside a transaction on a dedicated connection, committing on
   * success and rolling back on any thrown error. `fn` receives a
   * connection-scoped query/execute pair bound to the same transaction.
   */
  async transaction<T>(fn: (tx: { query: DatabaseService['query']; execute: DatabaseService['execute'] }) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const tx = {
        query: async <R extends RowDataPacket[]>(sql: string, params: QueryParams = []) => {
          const [rows] = await conn.query<R>(sql, params);
          return rows;
        },
        execute: async (sql: string, params: QueryParams = []) => {
          const [result] = await conn.execute<ResultSetHeader>(sql, params);
          return result;
        },
      };
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

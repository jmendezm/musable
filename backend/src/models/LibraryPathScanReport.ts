import Database from '../config/database';
import logger from '../utils/logger';

export interface ScanError {
  id: number;
  scan_report_id: number;
  file_path: string;
  error_message: string;
  error_type?: string;
  created_at: string;
}

export interface LibraryPathScanReport {
  id: number;
  library_path_id: number;
  scan_id?: number;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  started_at: string;
  completed_at?: string;
  files_scanned: number;
  files_added: number;
  files_updated: number;
  files_removed: number;
  files_renamed: number;
  files_skipped: number;
  duplicates_found: number;
  errors_count: number;
  error_message?: string;
  progress: number;
  total_files: number;
  created_at: string;
  updated_at: string;
  errors?: ScanError[];
}

export interface CreateScanReportData {
  library_path_id: number;
  scan_id?: number;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  started_at: string;
}

class LibraryPathScanReportModel {
  public db = Database;

  async create(data: CreateScanReportData): Promise<LibraryPathScanReport> {
    const result = await this.db.run(
      `INSERT INTO library_path_scan_reports (
        library_path_id, scan_id, status, started_at,
        files_scanned, files_added, files_updated, files_removed, files_renamed, files_skipped,
        duplicates_found, errors_count, progress, total_files
      ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
      [
        data.library_path_id,
        data.scan_id || null,
        data.status,
        data.started_at
      ]
    );

    return this.findById(result.lastID!);
  }

  async findById(id: number): Promise<LibraryPathScanReport | null> {
    const report = await this.db.query(
      'SELECT * FROM library_path_scan_reports WHERE id = ?',
      [id]
    );

    return report[0] || null;
  }

  async findByLibraryPathId(
    libraryPathId: number,
    limit: number = 20
  ): Promise<LibraryPathScanReport[]> {
    const reports = await this.db.query(
      `SELECT * FROM library_path_scan_reports
       WHERE library_path_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
      [libraryPathId, limit]
    );

    return reports;
  }

  async getLatestByLibraryPathId(
    libraryPathId: number
  ): Promise<LibraryPathScanReport | null> {
    const reports = await this.findByLibraryPathId(libraryPathId, 1);
    return reports[0] || null;
  }

  async findByIdWithErrors(id: number): Promise<LibraryPathScanReport | null> {
    const report = await this.db.query(
      'SELECT * FROM library_path_scan_reports WHERE id = ?',
      [id]
    );

    if (!report[0]) {
      return null;
    }

    const errors = await this.db.query(
      'SELECT * FROM library_path_scan_errors WHERE scan_report_id = ? ORDER BY created_at DESC',
      [id]
    );

    return {
      ...report[0],
      errors
    };
  }

  async update(id: number, data: Partial<LibraryPathScanReport>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && key !== 'errors' && value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await this.db.run(
      `UPDATE library_path_scan_reports SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }

  async updateProgress(
    id: number,
    filesScanned: number,
    filesAdded: number,
    filesUpdated: number,
    filesSkipped: number,
    errorsCount: number,
    progress: number
  ): Promise<void> {
    await this.db.run(
      `UPDATE library_path_scan_reports
       SET files_scanned = ?,
           files_added = ?,
           files_updated = ?,
           files_skipped = ?,
           errors_count = ?,
           progress = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [filesScanned, filesAdded, filesUpdated, filesSkipped, errorsCount, progress, id]
    );
  }

  async updateFullProgress(
    id: number,
    filesScanned: number,
    filesAdded: number,
    filesUpdated: number,
    filesRemoved: number,
    filesRenamed: number,
    filesSkipped: number,
    duplicatesFound: number,
    errorsCount: number,
    progress: number
  ): Promise<void> {
    await this.db.run(
      `UPDATE library_path_scan_reports
       SET files_scanned = ?,
           files_added = ?,
           files_updated = ?,
           files_removed = ?,
           files_renamed = ?,
           files_skipped = ?,
           duplicates_found = ?,
           errors_count = ?,
           progress = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [filesScanned, filesAdded, filesUpdated, filesRemoved, filesRenamed, filesSkipped, duplicatesFound, errorsCount, progress, id]
    );
  }

  async addError(
    scanReportId: number,
    filePath: string,
    errorMessage: string,
    errorType?: string
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO library_path_scan_errors (scan_report_id, file_path, error_message, error_type)
       VALUES (?, ?, ?, ?)`,
      [scanReportId, filePath, errorMessage, errorType || null]
    );
  }

  async markAsCompleted(
    id: number,
    completedAt: string,
    errorMessage?: string
  ): Promise<void> {
    await this.db.run(
      `UPDATE library_path_scan_reports
       SET status = 'completed',
           completed_at = ?,
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [completedAt, errorMessage || null, id]
    );
  }

  async markAsFailed(
    id: number,
    completedAt: string,
    errorMessage: string
  ): Promise<void> {
    await this.db.run(
      `UPDATE library_path_scan_reports
       SET status = 'failed',
           completed_at = ?,
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [completedAt, errorMessage, id]
    );
  }

  async markAsStopped(id: number, completedAt: string): Promise<void> {
    await this.db.run(
      `UPDATE library_path_scan_reports
       SET status = 'stopped',
           completed_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [completedAt, id]
    );
  }

  async getErrors(scanReportId: number): Promise<ScanError[]> {
    return await this.db.query(
      'SELECT * FROM library_path_scan_errors WHERE scan_report_id = ? ORDER BY created_at DESC',
      [scanReportId]
    );
  }

  async deleteByLibraryPathId(libraryPathId: number): Promise<void> {
    await this.db.run(
      'DELETE FROM library_path_scan_reports WHERE library_path_id = ?',
      [libraryPathId]
    );
  }

  async delete(id: number): Promise<void> {
    // First delete associated errors
    await this.db.run(
      'DELETE FROM library_path_scan_errors WHERE scan_report_id = ?',
      [id]
    );

    // Then delete the report
    await this.db.run(
      'DELETE FROM library_path_scan_reports WHERE id = ?',
      [id]
    );
  }
}

export default new LibraryPathScanReportModel();

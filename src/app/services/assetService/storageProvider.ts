import { SERVER_SITE_URL } from "src/app/consts/constants";
import { deleteWithAutoRetry, getWithAutoRetry, putWithAutoRetry } from "../request-helper.service";
import { withQueueMap } from "./withQueueMap";

export interface IStorageProvider {
    isValidConnection(): Promise<boolean | undefined | void>;
    isFileExists(filename: string, ignoreNotFound?: boolean): Promise<boolean>;

    listFilesInFolder(extension?: string): Promise<string[]>;

    readText(filename: string, ignoreNotFound?: boolean): Promise<string | undefined | void>;
    readBinary(filename: string, ignoreNotFound?: boolean): Promise<Buffer | undefined | void>;

    writeText(filename: string, contents: string): Promise<void>;
    writeBinary(filename: string, contents: ArrayBuffer): Promise<void>;

    deleteFile(filename: string, ignoreNotFound?: boolean): Promise<void>;
}

export interface IStorageProviderError {
    code: string;
    message: string;
}

export const serverUrl = SERVER_SITE_URL;

/**
 * Storage Provider for local storage
 */
@withQueueMap
export class StorageProvider implements IStorageProvider {
    /**
     * Check if the connection is valid
     */
    public async isValidConnection(): Promise<boolean | undefined | void> {
        try {
            const api = `${serverUrl}`;
            const result = await getWithAutoRetry(api);

            return result.data.success;
        } catch (ex) {
            this.storageErrorHandler(ex);
        }
    }

    /**
     * Read text from specified file
     * @param filename - Name of file in container
     */
    public async readText(filename: string, ignoreNotFound?: boolean): Promise<string | undefined | void> {
        try {
            const api = `${serverUrl}/files/${filename}`;
            const result = await getWithAutoRetry(api);

            return JSON.stringify(result.data);
        } catch (ex) {
            this.storageErrorHandler(ex, ignoreNotFound);
        }
    }

    /**
     * Read Buffer from specified file
     * @param filename - Name of file in container
     */
    public async readBinary(filename: string, ignoreNotFound?: boolean): Promise<Buffer | undefined | void> {
        try {
            const api = `${serverUrl}/files/${filename}`;
            const result = await getWithAutoRetry(api, { responseType: "arraybuffer" });

            return result.data;
        } catch (exception) {
            this.storageErrorHandler(exception, ignoreNotFound);
        }
    }

    /**
     * Write text to file in container
     * @param filename - Name of file in container
     * @param content - Content to write to file (string or Buffer)
     */
    public async writeText(filename: string, content: string) {
        try {
            const api = `${serverUrl}/files/${filename}`;
            await putWithAutoRetry(api, {
                content,
            });
        } catch (exception) {
            this.storageErrorHandler(exception);
        }
    }

    /**
     * Write buffer to file in container
     * @param filename - Name of file in container
     * @param content - Buffer to write to file
     */
    public async writeBinary(filename: string, content: ArrayBuffer) {
        try {
            const api = `${serverUrl}/files/${filename}`;
            await putWithAutoRetry(api, {
                content,
            });
        } catch (exception) {
            this.storageErrorHandler(exception);
        }
    }

    /**
     * Delete file from container
     * @param filename - Name of file in container
     */
    public async deleteFile(filename: string, ignoreNotFound?: boolean): Promise<void> {
        try {
            const api = `${serverUrl}/files/${filename}`;
            await deleteWithAutoRetry(api);
        } catch (exception) {
            this.storageErrorHandler(exception, ignoreNotFound);
        }
    }

    /**
     * List files in container at specific folder
     * @param path - Folder path containing the files.
     * @param extension - Extension of files to filter on when retrieving files from container
     */
    public async listFilesInFolder(extension?: string): Promise<string[]> {
        let files: string[] = [];
        try {
            const api = `${serverUrl}/files`;
            const result = await getWithAutoRetry(api);
            files = result.data;
        } catch (exception) {
            this.storageErrorHandler(exception);
        }

        return files;
    }

    /**
     * Check file is exists
     * @param filename
     */
    public async isFileExists(filename: string, ignoreNotFound?: boolean): Promise<boolean> {
        try {
            const api = `${serverUrl}/files/${filename}`;
            const result = await getWithAutoRetry(api);
            return result.data !== null;
        } catch (exception) {
            this.storageErrorHandler(exception, ignoreNotFound);
        }

        return false;
    }

    private storageErrorHandler = (exception: any, ignoreNotFound?: boolean) => {
        if (exception.response?.status === 404 && ignoreNotFound) {
            return;
        }

        const error: IStorageProviderError = {
            code: "Failed to access local files",
            message: "Failed to send request to local server. Please check your server connection.",
        };
        throw error;
    };
}

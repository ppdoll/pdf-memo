import { storage } from '../../storage';
import { LibraryService } from './libraryService';

/** 앱 전역 라이브러리 서비스 (테스트는 LibraryService 클래스에 가짜 저장소를 넣는다) */
export const libraryService = new LibraryService(storage);

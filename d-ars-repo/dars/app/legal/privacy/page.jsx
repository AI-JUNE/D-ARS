import LegalDoc from '../LegalDoc';
import { PRIVACY_SECTIONS } from '@/lib/legalContent';

// 루트 템플릿 '%s · D-ARS' 가 접미를 붙이므로 세그먼트 제목만 지정(중복 '· D-ARS · D-ARS' 방지).
export const metadata = { title: '개인정보처리방침', description: 'D-ARS(보이는 ARS) 개인정보처리방침' };

export default function PrivacyPage() {
  return <LegalDoc title="개인정보처리방침" sections={PRIVACY_SECTIONS} />;
}

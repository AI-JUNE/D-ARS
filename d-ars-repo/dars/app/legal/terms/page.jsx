import LegalDoc from '../LegalDoc';
import { TERMS_SECTIONS } from '@/lib/legalContent';

// 루트 템플릿 '%s · D-ARS' 가 접미를 붙이므로 세그먼트 제목만 지정(중복 '· D-ARS · D-ARS' 방지).
export const metadata = { title: '이용약관', description: 'D-ARS(보이는 ARS) 이용약관' };

export default function TermsPage() {
  return <LegalDoc title="이용약관" sections={TERMS_SECTIONS} />;
}

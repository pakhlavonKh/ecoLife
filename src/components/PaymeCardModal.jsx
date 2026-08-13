import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { api } from '../api/client';

export default function PaymeCardModal({ paymentId, publicCode, amountStr, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Card input, 2: SMS OTP
  const [cardNumber, setCardNumber] = useState('');
  const [expire, setExpire] = useState('');
  const [token, setToken] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatCardNumber = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };

  const formatExpire = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  };

  const handleCardSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanCard = cardNumber.replace(/\s/g, '');
    if (cleanCard.length !== 16) {
      setError('Введите 16-значный номер карты');
      return;
    }
    if (!/^(0[1-9]|1[0-2])\/?([0-9]{2})$/.test(expire)) {
      setError('Укажите срок действия в формате ММ/ГГ');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/api/v1/payments/payme/card/create', {
        paymentId,
        number: cleanCard,
        expire,
      });

      setToken(data.token);
      setPhone(data.phone || '');
      setStep(2);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Ошибка при обработке карты';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (smsCode.trim().length !== 6) {
      setError('Введите 6-значный СМС код');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/api/v1/payments/payme/card/pay', {
        paymentId,
        token,
        code: smsCode.trim(),
      });

      if (data.success) {
        if (onSuccess) {
          onSuccess(data.publicCode || publicCode);
        } else {
          window.location.assign(`/booking/success?code=${encodeURIComponent(data.publicCode || publicCode)}`);
        }
      } else {
        setError('Не удалось завершить оплату');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Неверный код СМС или ошибка оплаты';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div className="payme-modal-overlay">
      <div className="payme-modal-card">
        {/* Header */}
        <div className="payme-modal-header">
          <div className="payme-modal-header-info">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            <div>
              <h3 className="payme-modal-title">Оплата через Payme</h3>
              <p className="payme-modal-subtitle">Безопасный платежный шлюз</p>
            </div>
          </div>
          <button onClick={onClose} className="payme-modal-close" aria-label="Закрыть">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="payme-modal-body">
          <div className="payme-modal-amount">
            <span>Сумма предоплаты:</span>
            <strong>{amountStr} UZS</strong>
          </div>

          {error && <div className="payme-modal-error">{error}</div>}

          {step === 1 ? (
            <form onSubmit={handleCardSubmit} style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label className="payme-modal-label">Номер карты (Uzcard / Humo)</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="8600 0000 0000 0000"
                  maxLength={19}
                  required
                  className="payme-modal-input"
                />
              </div>

              <div>
                <label className="payme-modal-label">Срок действия (ММ/ГГ)</label>
                <input
                  type="text"
                  value={expire}
                  onChange={(e) => setExpire(formatExpire(e.target.value))}
                  placeholder="03/28"
                  maxLength={5}
                  required
                  className="payme-modal-input"
                  style={{ width: '130px' }}
                />
              </div>

              <div style={{ paddingTop: '0.5rem' }}>
                <button type="submit" disabled={loading} className="payme-modal-btn">
                  {loading ? 'Отправка СМС...' : 'Получить код СМС'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.85rem', opacity: 0.85, margin: '0 0 0.75rem' }}>
                  Код отправлен на номер: <strong style={{ fontFamily: 'monospace' }}>{phone || 'вашей карты'}</strong>
                </p>
                <label className="payme-modal-label">Код из СМС</label>
                <input
                  type="text"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="666666"
                  maxLength={6}
                  autoFocus
                  required
                  className="payme-modal-input"
                  style={{ textAlign: 'center', fontSize: '1.4rem', letterSpacing: '0.2em' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  style={{
                    padding: '0.8rem 1rem',
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Назад
                </button>
                <button type="submit" disabled={loading} className="payme-modal-btn" style={{ flex: 1 }}>
                  {loading ? 'Обработка...' : 'Подтвердить и оплатить'}
                </button>
              </div>
            </form>
          )}

          {/* Footer Security Notice */}
          <div className="payme-modal-footer">
            <p style={{ margin: 0 }}>
              Все данные передаются в зашифрованном виде на сервер Payme Business.<br />
              Данные карты не сохраняются.{' '}
              <a href="https://cdn.payme.uz/terms/main.html" target="_blank" rel="noopener noreferrer">
                Оферта Payme
              </a>
            </p>
            <div style={{ marginTop: '0.4rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Powered by Payme
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}

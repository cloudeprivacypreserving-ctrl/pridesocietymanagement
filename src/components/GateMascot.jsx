// Illustrated security-officer mascot for the Gatehouse Terminal login.
// Renders one of 9 pose images as a circular avatar in the terminal
// header bar and cross-fades between poses as the login flow changes
// state. Pure <img> swap + CSS transition — no animation library.
//
// The pose images live in src/assets/mascot/ and are imported so Vite
// fingerprints and bundles them. Keep them light (~100-200 KB each);
// they're lazy in effect because only the current pose is shown, but the
// browser will fetch each the first time its state occurs.
import { useEffect, useRef, useState } from 'react';
import emailFocus from '../assets/mascot/emailfocus.webp';
import emailValid from '../assets/mascot/emailvalid.webp';
import passwordFocus from '../assets/mascot/passwordfocus.webp';
import passwordTyping from '../assets/mascot/passwordtyping.webp';
import passwordVisible from '../assets/mascot/passwordvisible.webp';
import passwordHide from '../assets/mascot/paswordhide.webp';
import signHover from '../assets/mascot/signhover.webp';
import loginSuccess from '../assets/mascot/loginsuccess.webp';
import loginError from '../assets/mascot/loginerror.webp';

const POSES = {
  idle: { src: emailValid, label: 'Officer on duty' },
  emailFocus: { src: emailFocus, label: 'Reviewing officer ID' },
  emailValid: { src: emailValid, label: 'Officer ID looks good' },
  passwordFocus: { src: passwordFocus, label: 'Keeping your passcode private' },
  passwordTyping: { src: passwordTyping, label: 'Eyes covered while you type' },
  passwordVisible: { src: passwordVisible, label: 'Passcode revealed' },
  passwordHide: { src: passwordHide, label: 'Passcode hidden again' },
  signHover: { src: signHover, label: 'Ready to authenticate' },
  success: { src: loginSuccess, label: 'Access granted' },
  error: { src: loginError, label: 'Authentication failed' },
};

// Preload every pose once the component mounts so later state changes
// swap instantly instead of showing a blank frame on first occurrence.
function usePreload() {
  useEffect(() => {
    Object.values(POSES).forEach(({ src }) => {
      const img = new Image();
      img.src = src;
    });
  }, []);
}

export default function GateMascot({ state }) {
  usePreload();
  const pose = POSES[state] || POSES.idle;

  // Track the previous pose briefly so we can cross-fade: the outgoing
  // image fades out on top while the new one fades in underneath.
  const [layers, setLayers] = useState([{ key: 0, ...pose }]);
  const counter = useRef(0);
  const lastSrc = useRef(pose.src);

  useEffect(() => {
    if (pose.src === lastSrc.current) return;
    lastSrc.current = pose.src;
    counter.current += 1;
    const key = counter.current;
    setLayers((prev) => [...prev.slice(-1), { key, ...pose }]);
    const t = setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.key === key));
    }, 320);
    return () => clearTimeout(t);
  }, [pose.src, pose.label]);

  return (
    <span className="gate-mascot" role="img" aria-label={pose.label} title={pose.label}>
      {layers.map((l, i) => (
        <img
          key={l.key}
          src={l.src}
          alt=""
          aria-hidden="true"
          className={`gate-mascot-img${i === layers.length - 1 ? ' is-current' : ' is-leaving'}`}
        />
      ))}
    </span>
  );
}

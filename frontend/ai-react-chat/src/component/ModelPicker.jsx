import { useLanguage } from '../i18n/LanguageProvider';
import { useEffect, useId, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, Paintbrush, Sparkles } from 'lucide-react';

export default function ModelPicker({ options, value, onChange, disabled, error }) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const id = useId();
  const selected = options.find((item) => item.value === value);
  const Icon = selected?.imageGeneration ? Paintbrush : Sparkles;

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const dismiss = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open, id]);

  const choose = (option) => {
    if (!option || option.available === false) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };
  return <div className="model-picker" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="model-trigger" disabled={disabled || !options.length}
      aria-label={t("选择 AI 模型")} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
      title={selected?.label?.replace('预览版', t('预览版'))} onClick={() => {
        setActive(Math.max(0, options.findIndex((item) => item.value === value)));
        setOpen(!open);
      }}>
      <Icon size={15} /><span>{selected?.compactLabel?.replace('预览', t('预览版')) || (options.length ? t('No models available') : error ? t('模型加载失败，请确认后端已启动后刷新') : t('加载模型…'))}</span><ChevronDown size={13} />
    </button>
    {open && <div className="model-popover">
      <div className="model-popover-heading"><span>{t("为这次对话，选个搭档")}</span><small>{t("选择模型")}</small></div>
      <div ref={list} id={`${id}-list`} className="model-list" role="listbox" tabIndex={0}
        aria-label={t("AI 模型")} aria-activedescendant={`${id}-${active}`} onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) event.preventDefault();
          if (event.key === 'ArrowDown') setActive((index) => (index + 1) % options.length);
          if (event.key === 'ArrowUp') setActive((index) => (index - 1 + options.length) % options.length);
          if (event.key === 'Home') setActive(0);
          if (event.key === 'End') setActive(options.length - 1);
          if (event.key === 'Enter' || event.key === ' ') choose(options[active]);
          if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
        }}>
        {options.map((option, index) => {
          const OptionIcon = option.imageGeneration ? Paintbrush : option.group === '推理与编程' ? Brain : Sparkles;
          return <div key={option.value}>
            {(index === 0 || options[index - 1].group !== option.group) && <p className="model-group-label">{t(option.group)}</p>}
            <div id={`${id}-${index}`} role="option" aria-selected={value === option.value} aria-disabled={option.available === false}
              className={`model-option ${index === active ? 'focused' : ''}`} onMouseMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
              <span className="model-option-icon"><OptionIcon size={17} /></span>
              <span><strong>{option.label.replace('预览版', t('预览版'))}{option.access && <em className="model-access-badge">{option.access === 'free' ? t('Free') : 'Pro'}</em>}</strong><small>{option.available === false ? t(option.unavailableReason || 'MODEL_UNAVAILABLE') : option.imageGeneration ? t("用文字和参考图，创造新画面") : option.group === '推理与编程' ? t("深入思考，拆解复杂问题") : t("陪你写作、探索和聊聊日常")}</small></span>
              {value === option.value && <Check size={16} className="model-check" />}
            </div>
          </div>;
        })}
      </div>
      <p className="model-popover-note">{t("不同模型的可用额度由服务账号决定")}</p>
    </div>}
  </div>;
}

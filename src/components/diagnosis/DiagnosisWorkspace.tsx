import { useEffect, useState, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Stethoscope,
  Sparkles,
  Mic,
  MicOff,
  History,
  Search,
  X,
  Printer,
  Trash2,
  FileText,
  FolderOpen,
  Camera,
  Image,
  Bone,
  MapPin,
  UserRound,
  SlidersHorizontal,
} from "lucide-react";
import { useAppStore } from "../../lib/store";
import { aiEngine, rankHybrid, type RankedRemedy } from "../../lib/ai-ranking";
import { useSymptomAutocomplete } from "../../hooks/useSymptomAutocomplete";
import { normalizeSymptomsForSearch, symptomLangLabel } from "../../lib/symptom-nlp";
import { parseSeverityWeightedSymptoms } from "../../lib/symptom-severity";
import { can } from "../../lib/rbac";
import { appendLocalAudit } from "../../lib/privacy";
import { embeddingEngine } from "../../lib/embeddings";
import {
  saveDiagnosis,
  saveStructuredCaseData,
  listHistory,
  deleteDiagnosis,
  searchHistory,
  searchPatientsLive,
  listVisitsForPatient,
  generatePatientUdid,
  type DiagnosisRecord,
  type PatientSummary,
} from "../../lib/db";
import { checkLicenseForUser } from "../../lib/license";
import { MIASM_TAGS } from "../../lib/miasm";
import { tr, getLang } from "../../lib/i18n";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import PatientTimeline from "./PatientTimeline";
import OutcomeIntelligencePanel from "./OutcomeIntelligencePanel";
import LongitudinalIntelligencePanel from "./LongitudinalIntelligencePanel";
import RemedyFeedback from "./RemedyFeedback";
import { findSimilarCases, findSimilarApprovedCases, type SimilarCase } from "../../lib/semantic-search";
import { getMateriaEvidence, type MateriaEvidenceMatch } from "../../lib/materia-medica-evidence";
import { printPatientHistory, printHtml } from "../../lib/print";
import { buildCaseReportHtml } from "../../lib/rx";
import { getPrintTemplate } from "../../lib/print-templates";
import { fillMissingVitals } from "../../lib/default-vitals";
import { buildClinicalAssessment, type ClinicalAssessment } from "../../lib/clinical-assessment";
import { refreshClinicLearning } from "../../lib/clinic-learning";
import clsx from "clsx";
import { analyzeCaseIntelligence, type CaseIntelligence } from "../../lib/homeopathic-intelligence";
import { matchRubrics, repertorizeRubricHits, type RubricHit } from "../../lib/repertory";
import { assessClinicalSafety, type SafetyAssessment } from "../../lib/clinical-safety";
import ClinicalSafetyPanel from "./ClinicalSafetyPanel";
import UnifiedIntelligencePanel from "./UnifiedIntelligencePanel";
import { buildUnifiedCaseIntelligence, type UnifiedCaseIntelligence } from "../../lib/unified-clinical-intelligence";
import { buildLongitudinalIntelligence } from "../../lib/longitudinal-intelligence";
import { QUICK_SYMPTOMS, toggleSymptomToken } from "../../lib/quick-symptoms";
import { buildAnalysisProvenance, setVisitState } from "../../lib/v104-hardening";
import { CURRENT_KNOWLEDGE_VERSION } from "../../lib/knowledge-governance";

interface Props {
  showHistory?: boolean;
  /** Android uses the full clinical workflow; desktop-only legacy surfaces are disabled on this branch. */
  mobile?: boolean;
}

export default function DiagnosisWorkspace({ showHistory = false, mobile: isMobile = false }: Props) {
  const [clinicalAssessment, setClinicalAssessment] = useState<ClinicalAssessment | null>(null);
  const [unifiedIntelligence, setUnifiedIntelligence] = useState<UnifiedCaseIntelligence | null>(null);
  const [savedDiagnosisId, setSavedDiagnosisId] = useState<number | undefined>(undefined);
  const [longitudinalForUnified, setLongitudinalForUnified] = useState<any>(null);
  const [caseIntelligence, setCaseIntelligence] = useState<CaseIntelligence | null>(null);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const doctor = useAppStore((s) => s.doctor)!;
  const results = useAppStore((s) => s.results);
  const setResults = useAppStore((s) => s.setResults);
  const lastSymptoms = useAppStore((s) => s.lastSymptoms);
  const setActivePanel = useAppStore((s) => s.setActivePanel);
  const patient = useAppStore((s) => s.patient);
  const setPatient = useAppStore((s) => s.setPatient);
  const loadPatientCase = useAppStore((s) => s.loadPatientCase);
  const clearPatient = useAppStore((s) => s.clearPatient);

  const name = patient.name;
  const age = patient.age;
  const mobile = patient.mobile;
  const gender = patient.gender;
  const bp = patient.bp;
  const pulse = patient.pulse;
  const temp = patient.temp;
  const resp = patient.resp;
  const symptoms = patient.symptoms;
  const patientUdid = patient.patient_udid;
  const outcome = patient.outcome;
  const conditionNote = patient.condition_note;
  const photoDataUrl = patient.photoDataUrl;
  const labFindings = patient.labFindings;
  const symptomAc = useSymptomAutocomplete({
    value: symptoms,
    onChange: (next) => setPatient({ symptoms: next }),
  });
  const symptomNlp = useMemo(() => {
    if (!(symptoms || "").trim()) return null;
    try {
      return normalizeSymptomsForSearch(symptoms);
    } catch {
      return null;
    }
  }, [symptoms]);
  const severityInfo = useMemo(() => {
    if (!(symptoms || "").trim()) return null;
    try {
      return parseSeverityWeightedSymptoms(symptoms);
    } catch {
      return null;
    }
  }, [symptoms]);
  const miasm = patient.miasm;
  const clinicalSafety = useMemo<SafetyAssessment>(() => {
    try { return assessClinicalSafety({ symptoms, age, bp, pulse, temp, resp, gender }); }
    catch { return { level: "clear", flags: [], vitals: [], requiresAcknowledgement: false }; }
  }, [symptoms, age, bp, pulse, temp, resp, gender]);
  useEffect(() => { setSafetyAcknowledged(false); }, [clinicalSafety.level, symptoms]);
  const liveRubricHits = useMemo<RubricHit[]>(() => {
    if (!(symptoms || '').trim()) return [];
    try { return matchRubrics(symptoms, 30); } catch { return []; }
  }, [symptoms]);
  const [selectedRubricIds, setSelectedRubricIds] = useState<string[]>([]);
  const selectedRubricHits = useMemo(() => liveRubricHits.filter((h) => selectedRubricIds.includes(h.rubric.id)), [liveRubricHits, selectedRubricIds]);

  const [running, setRunning] = useState(false);
  /** Prevent double-click / concurrent Run Diagnosis from creating 2 visits */
  const runLockRef = useRef(false);
  const [constitutionTags, setConstitutionTags] = useState<string[]>([]);
  const [history, setHistory] = useState<DiagnosisRecord[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [patientVisitCount, setPatientVisitCount] = useState(0);
  const [licActive, setLicActive] = useState(true);
  const [similar, setSimilar] = useState<SimilarCase[]>([]);
  const [showSimilar, setShowSimilar] = useState(false);
  const [materiaEvidence, setMateriaEvidence] = useState<Record<string, MateriaEvidenceMatch>>({});
  const [showMateriaEvidence, setShowMateriaEvidence] = useState(false);
  /** Live patient name/phone suggestions (returning patients) */
  const [patientHits, setPatientHits] = useState<PatientSummary[]>([]);
  const [showPatientHits, setShowPatientHits] = useState(false);
  const [patientSearchField, setPatientSearchField] = useState<"name" | "mobile" | null>(null);
  const [showRubricPicker, setShowRubricPicker] = useState(false);
  const [diagnosisMode, setDiagnosisMode] = useState<"advanced" | "simplified">("advanced");
  useEffect(() => { if (isMobile) setDiagnosisMode("advanced"); }, [isMobile]);
  const [quickSymptomQuery, setQuickSymptomQuery] = useState("");
  useEffect(() => {
    if (!patientUdid && !name.trim()) { setLongitudinalForUnified(null); return; }
    buildLongitudinalIntelligence(doctor.id, { patient_udid: patientUdid || undefined, patient_name: name, mobile }).then(setLongitudinalForUnified).catch(() => setLongitudinalForUnified(null));
  }, [doctor.id, patientUdid, name, mobile]);

  const speech = useSpeechRecognition({
    lang: getLang() === "ur" ? "ur-PK" : "en-US",
    onResult: (text, isFinal) => {
      if (isFinal && text) {
        setPatient({
          symptoms: symptoms ? `${symptoms} ${text}` : text,
        });
      }
    },
  });

  useEffect(() => {
    checkLicenseForUser(doctor.username).then((r) => setLicActive(!!r.active));
  }, [doctor.username]);

  useEffect(() => {
    if (showHistory) openHistory();
  }, [showHistory]);

  // Ctrl+N — new / clear patient
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        clearAll();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openHistory() {
    const rows = await listHistory(doctor.id);
    setHistory(Array.isArray(rows) ? rows : []);
  }

  function loadFromHistory(h: DiagnosisRecord) {
    const udid =
      h.patient_udid ||
      generatePatientUdid(h.patient_name, h.mobile);
    loadPatientCase({
      name: h.patient_name || "",
      age: h.age || "",
      mobile: h.mobile || "",
      gender: h.gender || "Male",
      bp: h.bp || "",
      pulse: h.pulse || "",
      temp: h.temperature || "",
      resp: h.respiration || "",
      symptoms: h.symptoms || "",
      miasm: h.miasm || "",
      patient_udid: udid,
      // Clear visit-specific outcome so doctor records this visit's condition
      outcome: "",
      condition_note: "",
    });
    // Restore ranked remedies if saved
    try {
      const ranked = JSON.parse(h.remedies_json || "[]");
      if (Array.isArray(ranked) && ranked.length) {
        setClinicalAssessment(buildClinicalAssessment({ symptoms: h.symptoms || "", labFindings: "" }));
        setResults(
          ranked.map((r: any) => ({
            remedy: r.remedy || r.name || String(r),
            score: Number(r.score) || 0,
            bm25: 0,
            overlap: 0,
            why: r.why || "",
            keynotes: r.keynotes || "",
            source: "history",
          })),
          h.symptoms || ""
        );
      }
    } catch {
      /* */
    }
    setShowPatientHits(false);
    setActivePanel("diagnosis");
  }

  /** Pick a returning patient from live suggestions — keeps same hidden UDID */
  function selectReturningPatient(p: PatientSummary) {
    const udid =
      p.patient_udid ||
      generatePatientUdid(p.patient_name, p.mobile);
    loadPatientCase({
      name: p.patient_name || "",
      mobile: p.mobile || "",
      age: p.age || age,
      gender: p.gender || gender,
      patient_udid: udid,
      // New visit: symptoms/outcome left for doctor to fill
      symptoms: "",
      outcome: "",
      condition_note: "",
    });
    setShowPatientHits(false);
    setPatientHits([]);
  }

  // Live patient lookup as name or mobile is typed
  useEffect(() => {
    const q = patientSearchField === "mobile" ? mobile : name;
    if (!q || q.trim().length < 2) {
      setPatientHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const hits = await searchPatientsLive(doctor.id, q.trim(), 10);
        if (!cancelled) {
          setPatientHits(hits);
          setShowPatientHits(hits.length > 0);
        }
      } catch {
        if (!cancelled) setPatientHits([]);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, mobile, patientSearchField, doctor.id]);

  // Case reports are longitudinal: expose the action only when the patient has
  // more than one saved visit. A stable UDID is preferred; name/mobile are the
  // existing fallback keys used by the database helper.
  useEffect(() => {
    if (!name.trim() && !mobile.trim() && !patientUdid) {
      setPatientVisitCount(0);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void listVisitsForPatient(doctor.id, {
        patient_udid: patientUdid || undefined,
        patient_name: name.trim() || undefined,
        mobile: mobile.trim() || undefined,
      }).then((visits) => {
        if (!cancelled) setPatientVisitCount(visits.length);
      }).catch(() => {
        if (!cancelled) setPatientVisitCount(0);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doctor.id, patientUdid, name, mobile]);

  async function printFullCaseReport() {
    if (patientVisitCount < 2) {
      alert("Case report is available only after this patient has more than one saved clinic visit.");
      return;
    }
    try {
      const visits = await listVisitsForPatient(doctor.id, {
        patient_udid: patientUdid || undefined,
        patient_name: name.trim() || undefined,
        mobile: mobile.trim() || undefined,
      });
      if (visits.length < 2) {
        setPatientVisitCount(visits.length);
        alert("Case report is available only after this patient has more than one saved clinic visit.");
        return;
      }
      const tpl = getPrintTemplate("report");
      const latest = [...visits].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
      const html = buildCaseReportHtml({
        clinicName: doctor.clinic_name || undefined,
        doctorName: doctor.full_name,
        patientName: name,
        clinicalDiagnosis: clinicalAssessment?.condition || latest?.condition_note || "",
        finalClinicalObservation: latest?.condition_note || latest?.outcome || "",
        visits,
      });
      printHtml(html, {
        title: `Case_Report_${(name || "Patient").trim().replace(/[^a-z0-9 _-]/gi, "").replace(/\s+/g, "_").slice(0, 80) || "Patient"}`,
        layout: tpl.paperHint === "A5" ? "a5" : "a4",
      });
    } catch (e) {
      console.warn("[case-report] could not build longitudinal report", e);
      alert("Could not load this patient's visit history for the case report.");
    }
  }

  /** Print all previous visits for current patient — does NOT re-save to DB/Firebase */
  async function printPreviousRecords() {
    if (!name.trim() && !mobile.trim() && !patientUdid) {
      alert("Enter patient name or mobile (or load a previous patient) first.");
      return;
    }
    try {
      const visits = await listVisitsForPatient(doctor.id, {
        patient_udid: patientUdid || undefined,
        patient_name: name.trim() || undefined,
        mobile: mobile.trim() || undefined,
      });
      if (!visits.length) {
        alert("No previous saved visits found for this patient.");
        return;
      }
      printPatientHistory({
        patientName: name.trim() || visits[0]?.patient_name || "Patient",
        mobile: mobile.trim() || visits[0]?.mobile,
        age: age || visits[0]?.age,
        gender: gender || visits[0]?.gender,
        visits,
        clinicName: doctor.clinic_name || undefined,
      });
      appendLocalAudit({
        doctor_id: doctor.id,
        username: doctor.username,
        action: "print_patient_history",
        detail: name.trim() || mobile.trim() || "(patient)",
      });
    } catch (e) {
      console.warn("[printPreviousRecords]", e);
      alert("Could not load visits for printing.");
    }
  }

  async function runDiagnosis() {
    // Hard lock: blocks double-click / rapid re-entry before React state updates
    if (runLockRef.current || running) return;
    runLockRef.current = true;

    if (!can(doctor.role, "diagnose")) {
      runLockRef.current = false;
      alert("Your role cannot run diagnosis.");
      return;
    }
    try {
      const lic = await checkLicenseForUser(doctor.username);
      setLicActive(!!lic.active);
      if (!lic.active) {
        alert("Activation required. Please activate your account.");
        setActivePanel("activate");
        return;
      }
      if (diagnosisMode === "simplified" && (!name.trim() || !age.trim() || !gender.trim())) {
        alert("Simplified diagnosis requires patient name, age, and gender.");
        return;
      }
      if (!symptoms.trim()) {
        alert("Please enter chief complaints / symptoms.");
        return;
      }
      if (clinicalSafety.requiresAcknowledgement && !safetyAcknowledged) {
        alert("Urgent clinical safety warning detected. Review the warning panel and acknowledge it before running automated remedy ranking.");
        return;
      }
      // Advanced mode keeps the existing vital auto-fill behavior. Simplified mode
      // intentionally keeps vitals optional and never invents missing measurements.
      const filled = diagnosisMode === "advanced"
        ? fillMissingVitals(age, { bp, pulse, temp, resp })
        : { bp, pulse, temp, resp };
      if (diagnosisMode === "advanced" && (filled.bp !== bp || filled.pulse !== pulse || filled.temp !== temp || filled.resp !== resp)) {
        setPatient({
          bp: filled.bp,
          pulse: filled.pulse,
          temp: filled.temp,
          resp: filled.resp,
        });
      }
      setRunning(true);
      await new Promise((r) => setTimeout(r, 40));
      const combined = symptoms;
      const assessment = buildClinicalAssessment({ symptoms, labFindings });
      setClinicalAssessment(assessment);
      let ranked = await rankHybrid(combined, {
        age: age ? parseInt(age, 10) : undefined,
        gender,
        topK: 12,
        useVectors: embeddingEngine.isEnabled(),
        useRepertory: true,
        constitutionTags: constitutionTags.length ? constitutionTags : undefined,
        condition: assessment.condition,
      });
      if (selectedRubricHits.length) {
        const { fuseRepertoryWithRanking } = await import('../../lib/repertory');
        ranked = fuseRepertoryWithRanking(ranked, repertorizeRubricHits(selectedRubricHits, 20), 0.22).slice(0, 12);
      }
      const intelligence = analyzeCaseIntelligence(combined, ranked, assessment.condition);
      setCaseIntelligence(intelligence);
      const enriched = ranked.map((r, i) => ({ ...r, confidence: intelligence.confidence }));
      setResults(enriched, symptoms);
      void buildAnalysisProvenance({ symptoms: combined, ranked: enriched, knowledgeVersion: CURRENT_KNOWLEDGE_VERSION, engineVersion: "ai-ranking-v1.0.4" }).then((provenance) => {
        try { localStorage.setItem(`hc_analysis_provenance_v104_${doctor.id}_${Date.now()}`, JSON.stringify(provenance)); } catch {}
      });

      appendLocalAudit({
        doctor_id: doctor.id,
        username: doctor.username,
        action: "save_diagnosis",
        detail: name.trim() || "(unnamed)",
      });

      // Save visit ONCE — keep lock held until DB write finishes
      const udid = generatePatientUdid(name, mobile, patientUdid);
      if (ranked.length && name.trim()) {
        if (udid !== patientUdid) setPatient({ patient_udid: udid });
        const savedDiagnosisId = await saveDiagnosis({
          doctor_id: doctor.id,
          patient_name: name.trim(),
          mobile,
          age,
          gender,
          bp: filled.bp,
          pulse: filled.pulse,
          temperature: filled.temp,
          respiration: filled.resp,
          symptoms,
          remedies_json: JSON.stringify(enriched.slice(0, 5)),
          miasm,
          patient_udid: udid,
          outcome: outcome || "",
          condition_note: conditionNote || "",
          photo_data: photoDataUrl || "",
        }, { clinicalCondition: assessment.condition });
        await setVisitState(doctor.id, savedDiagnosisId, "completed");
        try {
          const savedVisits = await listVisitsForPatient(doctor.id, {
            patient_udid: udid,
            patient_name: name.trim() || undefined,
            mobile: mobile.trim() || undefined,
          });
          setPatientVisitCount(savedVisits.length);
        } catch {
          // The report button will refresh its count on the next patient lookup.
        }
      }

      try {
        const approvedSim = await findSimilarApprovedCases(doctor.id, symptoms, 6);
        if (approvedSim.length) {
          setSimilar(approvedSim);
        } else {
          // Historical similarity remains a contextual aid, but is not treated as
          // trusted learning evidence.
          const sim = await findSimilarCases(doctor.id, symptoms, 6);
          setSimilar(sim);
        }
        const evidenceMap: Record<string, MateriaEvidenceMatch> = {};
        for (const r of ranked.slice(0, 8)) {
          const ev = getMateriaEvidence(r.remedy, combined);
          if (ev) evidenceMap[r.remedy.toLowerCase()] = ev;
        }
        setMateriaEvidence(evidenceMap);
        try { setUnifiedIntelligence(buildUnifiedCaseIntelligence({ assessment, safety: clinicalSafety, caseIntelligence: intelligence, ranked: enriched, longitudinal: await buildLongitudinalIntelligence(doctor.id, { patient_udid: udid, patient_name: name, mobile }), materia: evidenceMap, symptoms })); } catch { setUnifiedIntelligence(null); }
      } catch {
        setSimilar([]);
      }
    } finally {
      setRunning(false);
      runLockRef.current = false;
    }
  }

  function clearAll() {
    clearPatient();
    setClinicalAssessment(null);
    setCaseIntelligence(null);
    setUnifiedIntelligence(null);
    setConstitutionTags([]);
    setSelectedRubricIds([]);
    setShowRubricPicker(false);
    setSimilar([]);
    setShowSimilar(false);
    setMateriaEvidence({});
    setShowMateriaEvidence(false);
    setSavedDiagnosisId(undefined);
    setQuickSymptomQuery("");
    speech.reset();
  }

  function focusNextField(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.key !== "Enter") return;
    if (e.currentTarget.tagName === "TEXTAREA" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runDiagnosis();
      return;
    }
    if (e.currentTarget.tagName === "TEXTAREA") return;
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest("[data-patient-form]");
    if (!form) return;
    const nodes = Array.from(
      form.querySelectorAll<HTMLElement>("input, select, textarea, button.btn-primary")
    ).filter((n) => !(n as HTMLInputElement).disabled);
    const idx = nodes.indexOf(e.currentTarget as HTMLElement);
    if (idx >= 0 && idx < nodes.length - 1) nodes[idx + 1].focus();
  }


  const filteredHistory = historyQuery.trim()
    ? history.filter(
        (h) =>
          h.patient_name?.toLowerCase().includes(historyQuery.toLowerCase()) ||
          h.symptoms?.toLowerCase().includes(historyQuery.toLowerCase()) ||
          h.mobile?.includes(historyQuery)
      )
    : history;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="hc-diagnosis-topbar flex items-center justify-between px-4 md:px-5 h-12 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-teal-700 to-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-slate-800 dark:text-slate-100 truncate">{showHistory ? "Case Intelligence Archive" : "Homeopathic AI Command Center"}</h1>
                {!showHistory && <span className="hc-ai-badge hidden xl:inline-flex"><span className="hc-ai-pulse" /> LIVE INTELLIGENCE</span>}
              </div>
              {!showHistory && <div className="hidden md:block text-[9px] text-slate-400">Repertory · Materia Medica · Constitutional Analysis · Safety Review</div>}
            </div>
          </div>
          {!licActive && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
              License inactive
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="btn-ghost !px-2.5 !py-1.5 text-xs"
            onClick={() => {
              openHistory();
              setActivePanel("history");
            }}
          >
            <History className="w-4 h-4" /> History
          </button>
          <button
            className="btn-ghost !px-2.5 !py-1.5 text-xs"
            onClick={() => setActivePanel("rx-editor")}
            disabled={!results.length}
            title="Print prescription"
          >
            <Printer className="w-4 h-4" /> Rx
          </button>
          {patientVisitCount > 1 && (
            <button
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
              onClick={() => void printFullCaseReport()}
              title="Generate longitudinal case report for this patient's visits"
            >
              <FileText className="w-4 h-4" /> Case report
            </button>
          )}
          <button
            className="btn-ghost !px-2.5 !py-1.5 text-xs text-rose-600 dark:text-rose-400"
            onClick={clearAll}
            title="Clear the current unsaved patient entry and diagnosis results. Saved history is not deleted."
          >
            <Trash2 className="w-4 h-4" /> Clear patient
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">

        {/* Left: Patient form */}
        <div className="w-full lg:w-[42%] xl:w-[38%] border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-4 space-y-4">
          {!isMobile && !showHistory && (
            <div className="hc-ai-orbit rounded-2xl p-3.5">
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div>
                  <span className="hc-ai-badge"><span className="hc-ai-pulse" /> Homeopathic Intelligence</span>
                  <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">Deep case synthesis</div>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400 max-w-[420px]">
                    Build the totality of symptoms, identify characteristic rubrics, cross-check materia medica evidence and review clinical safety before prescribing.
                  </p>
                </div>
                <div className="hidden sm:flex shrink-0 flex-col items-end gap-1 text-[8px] uppercase tracking-wider text-slate-400">
                  <span>REPERTORY</span><span>MIASM</span><span>MATERIA</span><span>SAFETY</span>
                </div>
              </div>
            </div>
          )}

          {!isMobile && (<>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 p-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                  <SlidersHorizontal className="w-4 h-4 text-clinic-600" /> Diagnosis mode
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Switch between a quick intake and the full deep case-study workflow.</p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-0.5 shrink-0" role="group" aria-label="Diagnosis mode">
                <button type="button" onClick={() => setDiagnosisMode("simplified")} className={clsx("px-3 py-1.5 rounded-md text-[11px] font-semibold transition", diagnosisMode === "simplified" ? "bg-clinic-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")}>Simplified</button>
                <button type="button" onClick={() => setDiagnosisMode("advanced")} className={clsx("px-3 py-1.5 rounded-md text-[11px] font-semibold transition", diagnosisMode === "advanced" ? "bg-clinic-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")}>Advanced</button>
              </div>
            </div>
          </div>

          {diagnosisMode === "simplified" ? (
            <div data-patient-form className="space-y-3">
              <div className="rounded-xl border border-clinic-200 dark:border-clinic-900/60 bg-clinic-50/60 dark:bg-clinic-950/20 p-3">
                <div className="flex items-start gap-2">
                  <UserRound className="w-4 h-4 text-clinic-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Simplified diagnosis</div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Quick patient entry for straightforward visits. Vitals are optional; use Advanced for the complete case-study workflow.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Patient Name</label>
                  <input className="input" value={name} onChange={(e) => setPatient({ name: e.target.value })} onKeyDown={focusNextField} placeholder="Full name" autoComplete="off" />
                </div>
                <div>
                  <label className="label">Age</label>
                  <input className="input" value={age} onChange={(e) => setPatient({ age: e.target.value })} onKeyDown={focusNextField} placeholder="Years" inputMode="numeric" />
                </div>
                <div>
                  <label className="label">Gender</label>
                  <select className="input" value={gender} onChange={(e) => setPatient({ gender: e.target.value })} onKeyDown={focusNextField}>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Vitals <span className="font-normal text-slate-400">(optional)</span></div>
                    <p className="text-[10px] text-slate-500">Enter only measurements available for this visit.</p>
                  </div>
                  <span className="text-[9px] px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">Not required</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><label className="label">BP</label><input className="input" value={bp} onChange={(e) => setPatient({ bp: e.target.value })} placeholder="120/80" /></div>
                  <div><label className="label">Pulse</label><input className="input" value={pulse} onChange={(e) => setPatient({ pulse: e.target.value })} placeholder="bpm" /></div>
                  <div><label className="label">Temp</label><input className="input" value={temp} onChange={(e) => setPatient({ temp: e.target.value })} placeholder="°C" /></div>
                  <div><label className="label">Resp</label><input className="input" value={resp} onChange={(e) => setPatient({ resp: e.target.value })} placeholder="/min" /></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Quick / Chief Symptoms</div>
                    <p className="text-[10px] text-slate-500">Tap symptoms to add or remove them from the case.</p>
                  </div>
                  <span className="text-[9px] text-slate-400">{QUICK_SYMPTOMS.length} available</span>
                </div>
                <input className="input mb-2" value={quickSymptomQuery} onChange={(e) => setQuickSymptomQuery(e.target.value)} placeholder="Search quick symptoms…" />
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800 p-2 bg-white/70 dark:bg-slate-950/30">
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SYMPTOMS.filter((s) => !quickSymptomQuery.trim() || s.toLowerCase().includes(quickSymptomQuery.trim().toLowerCase())).map((s) => {
                      const selected = symptoms.toLowerCase().split(/[,\n]+/).map(x => x.trim()).filter(Boolean).includes(s.toLowerCase());
                      return <button key={s} type="button" onClick={() => setPatient({ symptoms: toggleSymptomToken(symptoms, s) })} className={clsx("text-[10px] px-2 py-1 rounded-full border transition", selected ? "bg-clinic-100 border-clinic-300 text-clinic-800 dark:bg-clinic-950/70 dark:border-clinic-800 dark:text-clinic-200" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")}>{s}</button>;
                    })}
                  </div>
                </div>
                <label className="label mt-2">Chief symptoms / additional notes</label>
                <textarea className="input min-h-[90px] resize-y" value={symptoms} onChange={(e) => setPatient({ symptoms: e.target.value })} placeholder="Add any symptom not selected above…" />
              </div>

              <button type="button" className="btn-glow w-full" onClick={runDiagnosis} disabled={running}>
                <Sparkles className="w-4 h-4" />
                {running ? "Analyzing…" : "Run AI Diagnosis"}
              </button>
              <p className="text-[10px] text-slate-400 text-center">Simplified mode uses only the quick patient details, optional vitals, and chief symptoms entered above.</p>
            </div>
          ) : null}
          {diagnosisMode === "advanced" && (
          <div data-patient-form className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label className="label">Patient Name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => {
                    setPatient({ name: e.target.value });
                    setPatientSearchField("name");
                  }}
                  onFocus={() => setPatientSearchField("name")}
                  onBlur={() => setTimeout(() => setShowPatientHits(false), 180)}
                  onKeyDown={focusNextField}
                  placeholder="Full name"
                  autoComplete="off"
                />
                {showPatientHits && patientSearchField === "name" && patientHits.length > 0 && (
                  <ul className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg text-sm">
                    {patientHits.map((p, i) => (
                      <li key={`${p.patient_name}-${p.mobile}-${i}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-clinic-50 dark:hover:bg-slate-800 flex flex-col gap-0.5"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectReturningPatient(p);
                          }}
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {p.patient_name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {p.mobile || "—"} · {p.visits} visit{p.visits !== 1 ? "s" : ""}
                            {p.last_visit ? ` · last ${p.last_visit.slice(0, 10)}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="relative">
                <label className="label">Mobile <span className="font-normal text-slate-400 normal-case">(optional)</span></label>
                <input
                  className="input"
                  value={mobile}
                  onChange={(e) => {
                    setPatient({ mobile: e.target.value });
                    setPatientSearchField("mobile");
                  }}
                  onFocus={() => setPatientSearchField("mobile")}
                  onBlur={() => setTimeout(() => setShowPatientHits(false), 180)}
                  onKeyDown={focusNextField}
                  placeholder="Optional phone"
                  autoComplete="off"
                />
                {showPatientHits && patientSearchField === "mobile" && patientHits.length > 0 && (
                  <ul className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg text-sm">
                    {patientHits.map((p, i) => (
                      <li key={`m-${p.patient_name}-${p.mobile}-${i}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-clinic-50 dark:hover:bg-slate-800 flex flex-col gap-0.5"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectReturningPatient(p);
                          }}
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {p.patient_name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {p.mobile || "—"} · {p.visits} visit{p.visits !== 1 ? "s" : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="label">Age</label>
                <input
                  className="input"
                  value={age}
                  onChange={(e) => setPatient({ age: e.target.value })}
                  onKeyDown={focusNextField}
                  placeholder="Years"
                />
              </div>
              <div>
                <label className="label">Gender</label>
                <select
                  className="input"
                  value={gender}
                  onChange={(e) => setPatient({ gender: e.target.value })}
                  onKeyDown={focusNextField}
                >
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            {/* Optional patient photo — explicit Camera vs Gallery */}
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                {photoDataUrl ? (
                  <img src={photoDataUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Patient photo</div>
                <p className="text-[11px] text-slate-500">Optional — take a new photo or pick one from the gallery.</p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <label className="btn-secondary !text-xs !py-1.5 !px-2.5 cursor-pointer inline-flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" /> Take photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 2_500_000) {
                          alert("Photo too large. Try again at lower resolution.");
                          e.target.value = "";
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          setPatient({ photoDataUrl: String(reader.result || "") });
                        };
                        reader.readAsDataURL(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label className="btn-secondary !text-xs !py-1.5 !px-2.5 cursor-pointer inline-flex items-center gap-1">
                    <Image className="w-3.5 h-3.5" /> From gallery
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 2_500_000) {
                          alert("Image too large. Choose a smaller photo (under ~2.5 MB).");
                          e.target.value = "";
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          setPatient({ photoDataUrl: String(reader.result || "") });
                        };
                        reader.readAsDataURL(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {photoDataUrl ? (
                    <button
                      type="button"
                      className="btn-ghost !text-xs !py-1.5 text-red-600"
                      onClick={() => setPatient({ photoDataUrl: "" })}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Visit condition — used for AI learning across visits */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Condition vs last visit</label>
                <select
                  className="input"
                  value={outcome}
                  onChange={(e) => setPatient({ outcome: e.target.value })}
                  onKeyDown={focusNextField}
                >
                  <option value="">— not set —</option>
                  <option value="better">Better</option>
                  <option value="same">Same</option>
                  <option value="worse">Worse</option>
                </select>
              </div>
              <div>
                <label className="label">Overall condition note</label>
                <input
                  className="input"
                  value={conditionNote}
                  onChange={(e) => setPatient({ condition_note: e.target.value })}
                  onKeyDown={focusNextField}
                  placeholder="e.g. sleep improved, pain less"
                />
              </div>
            </div>
            {patientUdid ? (
              <p className="text-[10px] text-slate-400">
                Returning patient linked (record kept under one ID — ID is not shown).
              </p>
            ) : null}

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="label">BP</label>
                <input className="input" value={bp} onChange={(e) => setPatient({ bp: e.target.value })} onKeyDown={focusNextField} placeholder="120/80" />
              </div>
              <div>
                <label className="label">Pulse</label>
                <input className="input" value={pulse} onChange={(e) => setPatient({ pulse: e.target.value })} onKeyDown={focusNextField} />
              </div>
              <div>
                <label className="label">Temp</label>
                <input className="input" value={temp} onChange={(e) => setPatient({ temp: e.target.value })} onKeyDown={focusNextField} />
              </div>
              <div>
                <label className="label">Resp</label>
                <input className="input" value={resp} onChange={(e) => setPatient({ resp: e.target.value })} onKeyDown={focusNextField} />
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <label className="label !mb-0">Chief Complaints / Symptoms</label>
                {speech.supported && (
                  <button
                    type="button"
                    onClick={speech.toggle}
                    className={clsx(
                      "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors",
                      speech.listening
                        ? "bg-red-50 border-red-300 text-red-700 animate-pulse"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50"
                    )}
                    title="Voice input"
                  >
                    {speech.listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    {speech.listening ? "Stop" : "Voice"}
                  </button>
                )}
              </div>
              <div className="mb-2 rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/70 dark:bg-slate-900/40">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Structured repertory rubrics</div>
                    <div className="text-[10px] text-slate-500">Optional: confirm characteristic rubrics before running analysis.</div>
                  </div>
                  <button type="button" className="btn-secondary !text-xs !py-1.5 !px-2.5" onClick={() => setShowRubricPicker(v => !v)}>
                    {showRubricPicker ? 'Close' : 'Select rubrics'}{selectedRubricIds.length ? ` (${selectedRubricIds.length})` : ''}
                  </button>
                </div>
                {showRubricPicker && (
                  <div className="mt-2 max-h-56 overflow-auto space-y-1 border-t border-slate-200 dark:border-slate-700 pt-2">
                    {liveRubricHits.length ? liveRubricHits.map((h) => {
                      const checked = selectedRubricIds.includes(h.rubric.id);
                      return <label key={h.rubric.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white dark:hover:bg-slate-800 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => setSelectedRubricIds(ids => checked ? ids.filter(id => id !== h.rubric.id) : [...ids, h.rubric.id])} className="mt-0.5" />
                        <span className="min-w-0"><span className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">{h.rubric.path}</span><span className="text-[10px] text-slate-400">Matched: {h.matchedKeywords.join(', ')}</span></span>
                      </label>;
                    }) : <div className="text-[10px] text-slate-400 py-2">Enter symptoms to see candidate rubrics.</div>}
                  </div>
                )}
              </div>
              <ClinicalSafetyPanel assessment={clinicalSafety} acknowledged={safetyAcknowledged} onAcknowledge={setSafetyAcknowledged} />
              <textarea
                className="input min-h-[110px] resize-y"
                value={symptoms}
                onChange={(e) => setPatient({ symptoms: e.target.value })}
                onKeyDown={(e) => {
                  symptomAc.onKeyDown(e);
                  focusNextField(e);
                }}
                onFocus={symptomAc.onFocus}
                onBlur={symptomAc.onBlur}
                placeholder="Type symptoms… matching suggestions appear as you type (Ctrl+Enter to diagnose)"
              />
              {/* Live suggestions — hidden until user types letters */}
              {symptomAc.showSuggestions && (
                <div
                  className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {symptomAc.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-clinic-50 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800 last:border-0"
                      onClick={() => symptomAc.select(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {speech.error && (
                <p className="text-[11px] text-red-500 mt-1">{speech.error}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                {symptomAc.catalogueSize}+ quick symptoms — English / اردو / Roman Urdu · type to search
              </p>
              {symptomNlp && symptomNlp.lang !== "en" && symptomNlp.normalized && (
                <p className="text-[10px] text-violet-600 dark:text-violet-400 mt-0.5">
                  NLP ({symptomLangLabel(symptomNlp.lang)}): {symptomNlp.normalized.slice(0, 120)}
                  {symptomNlp.normalized.length > 120 ? "…" : ""}
                </p>
              )}
              {severityInfo && severityInfo.emphasized.length > 0 && (
                <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                  Severity emphasis: {severityInfo.emphasized.slice(0, 4).join("; ")}
                </p>
              )}
            </div>

            <div>
              <label className="label">Lab Findings (optional)</label>
              <textarea
                className="input min-h-[60px] text-xs"
                value={labFindings}
                onChange={(e) => setPatient({ labFindings: e.target.value })}
                placeholder="Paste OCR or typed lab notes…"
              />
            </div>

            <div>
              <label className="label">Miasm (optional)</label>
              <div className="flex flex-wrap gap-1.5">
                {MIASM_TAGS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPatient({ miasm: miasm === m ? "" : m })}
                    className={clsx("chip", miasm === m && "chip-active")}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => setActivePanel("case-taking")}
            >
              <FileText className="w-4 h-4" /> Structured Case Taking
            </button>
            <button
              className="btn-glow w-full"
              onClick={runDiagnosis}
              disabled={running}
            >
              <Sparkles className="w-4 h-4" />
              {running ? "Analyzing…" : "Run AI Diagnosis"}
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              Shortcuts: Ctrl+D diagnose · Ctrl+N new patient · Ctrl+P Rx
            </p>
          </div>
          </>)}

          {/* Patient Timeline */}
          <PatientTimeline
            patientName={name}
            mobile={isMobile}
            patientUdid={patientUdid || undefined}
            onSelectVisit={(rec) => {
              loadFromHistory(rec);
            }}
            onPrintHistory={printPreviousRecords}
          />
          <OutcomeIntelligencePanel patientName={name} mobile={isMobile} patientUdid={patientUdid || undefined} />
          <LongitudinalIntelligencePanel patientName={name} mobile={isMobile} patientUdid={patientUdid || undefined} />
        </div>

        {/* Right: Results or History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {showHistory ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  className="input flex-1"
                  placeholder="Search history…"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                />
                <button className="btn-ghost !p-2" onClick={() => setActivePanel("diagnosis")}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              {filteredHistory.length === 0 ? (
                <div className="empty-state">No history records</div>
              ) : (
                filteredHistory.map((h) => (
                  <div key={h.id} className="result-card-n">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{h.patient_name || "Unnamed"}</div>
                        <div className="text-[11px] text-slate-500">
                          {h.created_at} · {h.age}y · {h.gender}
                          {h.mobile ? ` · ${h.mobile}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="btn-secondary !px-2 !py-1 text-[11px]"
                          title="Load into diagnosis form"
                          onClick={() => loadFromHistory(h)}
                        >
                          <FolderOpen className="w-3.5 h-3.5" /> Load
                        </button>
                        <button
                          type="button"
                          className="btn-ghost !p-1 text-red-500"
                          title="Delete"
                          onClick={async () => {
                            if (h.id && confirm("Delete this history record?")) {
                              await deleteDiagnosis(h.id);
                              openHistory();
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                      {h.symptoms}
                    </p>
                  </div>
                ))
              )}
            </>
          ) : running ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-24 rounded-xl" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="empty-state">
              <Stethoscope className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium text-slate-500">Ready for diagnosis</p>
              <p className="text-xs mt-1 max-w-xs">
                Enter patient symptoms and press <strong>Run AI Diagnosis</strong> or Ctrl+D
              </p>
            </div>
          ) : (
            <>
              <ClinicalSafetyPanel assessment={clinicalSafety} acknowledged={safetyAcknowledged} onAcknowledge={setSafetyAcknowledged} />
              {clinicalAssessment && (clinicalAssessment.condition || clinicalAssessment.keySymptoms.length) && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300">Clinical Diagnosis</div>
                    
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100">{clinicalAssessment.condition || "Clinical presentation"}</div>
                  {clinicalAssessment.keySymptoms.length > 0 && <div className="text-[11px] text-slate-600 dark:text-slate-300"><b>Key symptoms:</b> {clinicalAssessment.keySymptoms.slice(0, 6).join(" · ")}</div>}
                  {clinicalAssessment.suggestedTests.length > 0 && <div className="text-[11px] text-slate-600 dark:text-slate-300"><b>Recommended investigations:</b> {clinicalAssessment.suggestedTests.join(" · ")}</div>}
                </div>
              )}

              {caseIntelligence && (
                <div className="rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/70 dark:bg-violet-950/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-violet-700 dark:text-violet-300">Homeopathic Case Intelligence</div>
                    <span className="text-[10px] rounded-full px-2 py-1 bg-white/70 dark:bg-slate-900/60">{caseIntelligence.confidence} · {caseIntelligence.confidenceScore}/100</span>
                  </div>
                  {caseIntelligence.rubricHits.length > 0 && <div className="text-[11px] text-slate-600 dark:text-slate-300"><b>Matched rubrics:</b> {caseIntelligence.rubricHits.slice(0, 5).map(h => h.rubric.path).join(" · ")}</div>}
                  {caseIntelligence.missingDomains.length > 0 && <div className="text-[11px] text-slate-600 dark:text-slate-300"><b>Missing case domains:</b> {caseIntelligence.missingDomains.join(" · ")}</div>}
                  {caseIntelligence.followUpQuestions.length > 0 && <details><summary className="cursor-pointer text-[11px] font-medium text-violet-700 dark:text-violet-300">Suggested follow-up questions</summary><ul className="mt-1 ml-4 list-disc text-[11px] text-slate-600 dark:text-slate-300">{caseIntelligence.followUpQuestions.map(q => <li key={q}>{q}</li>)}</ul></details>}
                </div>
              )}

              {unifiedIntelligence && (
                <UnifiedIntelligencePanel
                  intel={unifiedIntelligence}
                  doctorId={doctor.id}
                  diagnosisId={savedDiagnosisId}
                  patientName={name}
                  patientUdid={patientUdid || undefined}
                  clinicalAssessment={clinicalAssessment?.condition}
                  safetyReviewed={!clinicalSafety.requiresAcknowledgement || safetyAcknowledged}
                  selectedRemedy={results[0]?.remedy}
                />
              )}

              {Object.keys(materiaEvidence).length > 0 && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 mb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-300">Materia Medica Evidence</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">Source passages matched against the current case. This is evidence retrieval, not diagnostic certainty.</div>
                    </div>
                    <button className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline" onClick={() => setShowMateriaEvidence(v => !v)}>{showMateriaEvidence ? "Hide" : "Show"}</button>
                  </div>
                  {showMateriaEvidence && <div className="mt-2 space-y-2">{results.slice(0, 6).map(r => { const ev = materiaEvidence[r.remedy.toLowerCase()]; if (!ev) return null; return <div key={r.remedy} className="rounded-lg bg-white/70 dark:bg-slate-900/50 p-2">
                    <div className="flex justify-between gap-2 text-[11px]"><b>{r.remedy}</b><span>{(ev.score * 100).toFixed(0)}% query-term coverage</span></div>
                    {ev.matchedTerms.length > 0 && <div className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-1">Matched: {ev.matchedTerms.join(", ")}</div>}
                    {ev.excerpts.length > 0 && <ul className="mt-1 ml-4 list-disc text-[10px] text-slate-600 dark:text-slate-300">{ev.excerpts.slice(0,2).map((x,i)=><li key={i}>{x}</li>)}</ul>}
                  </div>; })}</div>}
                </div>
              )}

              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Top Remedies ({results.length})
                </h2>
                {similar.length > 0 && (
                  <button
                    className="text-[11px] text-clinic-600 hover:underline"
                    onClick={() => setShowSimilar((v) => !v)}
                  >
                    {showSimilar ? "Hide" : "Show"} similar past cases ({similar.length})
                  </button>
                )}
              </div>

              {showSimilar && similar.length > 0 && (
                <div className="card p-3 space-y-2 mb-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {similar.length ? "Similar Cases" : "Similar Cases"}
                    <span className="ml-2 text-[10px] font-normal text-slate-400">Approved cases are prioritized as evidence</span>
                  </div>
                  {similar.map((s, i) => (
                    <div key={i} className="text-[11px] border-b border-slate-100 dark:border-slate-800 pb-1.5 last:border-0">
                      <div className="font-medium">
                        {s.record.patient_name || "Case"} · score {(s.score * 100).toFixed(0)}%
                      </div>
                      <div className="text-slate-500 line-clamp-1">{s.record.symptoms}</div>
                    </div>
                  ))}
                </div>
              )}

              {results.map((r: RankedRemedy, idx: number) => (
                <div
                  key={r.remedy + idx}
                  className={idx === 0 ? "result-card-top" : "result-card-n"}
                >
                  <div className="flex items-start gap-3">
                    <div className={idx === 0 ? "badge-rank-1" : "badge-rank-n"}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-clinic-800 dark:text-clinic-200">
                          {r.remedy}
                        </h3>
                        <span className="text-xs font-mono text-slate-500">
                          {(r.score * 100).toFixed(1)}%
                        </span>
                      </div>
                      {r.keynotes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-4">
                          {r.keynotes}
                        </p>
                      )}
                      {r.evidenceCount ? (
                        <div className="text-[10px] text-slate-400 mt-1">Materia medica evidence: {r.evidenceCount} source record{r.evidenceCount === 1 ? "" : "s"}</div>
                      ) : null}
                      {r.components && (
                        <details className="mt-1 text-[10px] text-slate-500">
                          <summary className="cursor-pointer hover:text-clinic-600">Why this ranked</summary>
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                            <span>BM25: {r.components.bm25.toFixed(2)}</span><span>Overlap: {(r.components.overlap * 100).toFixed(0)}%</span>
                            <span>Field match: {r.components.fieldBoost.toFixed(2)}</span><span>Modality: {r.components.modalityBoost.toFixed(2)}</span>
                            <span>Outcome evidence: {r.components.outcomeBoost.toFixed(3)}</span>
                          </div>
                        </details>
                      )}
                      {r.matched && r.matched.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {r.matched.slice(0, 6).map((m: string) => (
                            <span
                              key={m}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-clinic-50 dark:bg-clinic-950/40 text-clinic-700 dark:text-clinic-300"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                      <RemedyFeedback
                        remedy={r.remedy}
                        symptoms={lastSymptoms || symptoms}
                        rank={idx + 1}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      </div>
  );
}

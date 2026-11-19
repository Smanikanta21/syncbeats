import { LANDING_FAQS } from "@/lib/site";
export function FAQ() {
  return (
    <section
      id="faq"
      className="landing-section landing-container landing-faq"
      aria-labelledby="faq-title"
    >
      <div>
        <p className="landing-eyebrow">GOOD QUESTIONS</p>
        <h2 id="faq-title">
          Before you
          <br />
          <span className="landing-muted-heading">press play.</span>
        </h2>
        <p className="landing-faq-intro">
          A few things to know about
          <br />
          listening with SyncBeats.
        </p>
      </div>
      <div className="landing-faq-list">
        {LANDING_FAQS.map(({ question, answer }) => (
          <details key={question}>
            <summary>
              {question}
              <span className="landing-faq-plus" aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

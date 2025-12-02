import Head from 'next/head';

export default function LegalMentions() {
  return (
    <>
      <Head>
        <title>BytebeatCloud - Legal Notice</title>
      </Head>
      <section className="legal-section">
        <h1 id="fr">Mentions légales</h1>
        <div className="box">
          <h2>1. Éditeur du site</h2>
          <p>
            Le site <strong>bytebeat.cloud</strong> est édité par :
          </p>
          <p>
            <strong>Nom et prénom :</strong> {process.env.LEGAL_PUBLISHER_NAME}
            <br />
            <strong>Adresse :</strong> {process.env.LEGAL_PUBLISHER_ADDRESS}
            <br />
            <strong>Email :</strong> {process.env.LEGAL_CONTACT_EMAIL}
            <br />
            <strong>Responsable de la publication :</strong> {process.env.LEGAL_PUBLISHER_NAME}
          </p>

          <h2>2. Hébergement</h2>
          <p>
            Le site est hébergé par :<br />
            <strong>GitHub, Inc.</strong>
            <br />
            88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis
            <br />
            Site : https://github.com
          </p>

          <p>
            Les données applicatives peuvent être traitées et stockées par :<br />
            <strong>Supabase</strong> (Supabase) — voir leur documentation pour les régions
            d’hébergement.
            <br />
            Site : https://supabase.com
          </p>

          <h2>3. Propriété intellectuelle</h2>
          <p>
            Sauf mention contraire, l’ensemble du contenu publié sur <strong>bytebeat.cloud</strong>{' '}
            (code, interface, éléments graphiques, mises en forme) est la propriété de l’éditeur.
          </p>
          <p>
            Les contenus publiés par les utilisateurs restent la propriété de leurs auteurs. En
            publiant sur le site, l’utilisateur accorde à l’éditeur une licence non exclusive de
            diffusion limitée à l’affichage sur le site.
          </p>

          <h2>4. Données personnelles</h2>
          <p>
            Le site collecte et traite certaines données personnelles nécessaires au fonctionnement
            du service (création de compte, publications, likes, éventuels logs techniques). Le
            traitement repose sur les bases légales adaptées (exécution du contrat, intérêt légitime
            ou consentement selon le cas).
          </p>
          <p>
            Les données sont hébergées par Supabase, agissant en tant que sous-traitant. Vous
            disposez des droits d’accès, rectification, suppression, opposition et portabilité. Pour
            exercer vos droits, contactez : {process.env.LEGAL_CONTACT_EMAIL}
          </p>

          <h2>5. Responsabilité et modération</h2>
          <p>
            L’éditeur ne peut être tenu responsable des contenus publiés par les utilisateurs.
            L’éditeur se réserve le droit de modérer, supprimer ou suspendre tout contenu ou compte
            en cas d’abus.
          </p>

          <h2>6. Cookies</h2>
          <p>
            Le site utilise uniquement des cookies techniques strictement nécessaires au
            fonctionnement (authentification, préférences, thème). Si des outils d’analyse tiers
            sont ajoutés, une information claire et un consentement préalable seront mis en place.
          </p>

          <h2>7. Contact</h2>
          <p>
            Pour toute question : {process.env.LEGAL_CONTACT_EMAIL}
          </p>
        </div>

        <h1 id="en">Legal notice — English version</h1>
        <div className="box">
          <h2>1. Site publisher</h2>
          <p>
            The website <strong>bytebeat.cloud</strong> is published by:
          </p>
          <p>
            <strong>Name:</strong> {process.env.LEGAL_PUBLISHER_NAME}
            <br />
            <strong>Address:</strong> {process.env.LEGAL_PUBLISHER_ADDRESS}
            <br />
            <strong>Email:</strong> {process.env.LEGAL_CONTACT_EMAIL}
            <br />
            <strong>Publication manager:</strong> {process.env.LEGAL_PUBLISHER_NAME}
          </p>

          <h2>2. Hosting</h2>
          <p>
            The site is hosted by:
            <br />
            <strong>GitHub, Inc.</strong>
            <br />
            88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA
            <br />
            Site: https://github.com
          </p>

          <p>
            Application data may be processed and stored by:
            <br />
            <strong>Supabase</strong> (Supabase). Check their documentation for hosting regions.
            <br />
            Site: https://supabase.com
          </p>

          <h2>3. Intellectual property</h2>
          <p>
            Unless otherwise stated, all content on <strong>bytebeat.cloud</strong> (source code,
            UI, graphics, styling) is the property of the publisher.
          </p>
          <p>
            Content published by users remains the property of the authors. By publishing, users
            grant the publisher a non-exclusive license to display content on the site.
          </p>

          <h2>4. Personal data</h2>
          <p>
            The site collects personal data necessary for operation (account creation, posts, likes,
            technical logs). Data is processed based on appropriate legal grounds (contractual
            necessity, legitimate interest or consent where applicable).
          </p>
          <p>
            Data is hosted by Supabase (data processor). Users have rights of access, rectification,
            deletion, objection and portability. To exercise these rights contact: {process.env.LEGAL_CONTACT_EMAIL}.
          </p>

          <h2>5. Liability & moderation</h2>
          <p>
            The publisher is not responsible for user-generated content. The publisher reserves the
            right to moderate, remove or suspend content or accounts in case of abuse.
          </p>

          <h2>6. Cookies</h2>
          <p>
            The site uses only essential technical cookies (authentication, preferences, theme). If
            third-party analytics are added, users will be clearly informed and asked for consent
            where required.
          </p>

          <h2>7. Contact</h2>
          <p>
            For questions: {process.env.LEGAL_CONTACT_EMAIL}
          </p>
        </div>

        <footer>
          <p>Last updated: 2025-12-02</p>
        </footer>
      </section>
    </>
  );
}

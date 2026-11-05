import React from 'react';

// How to put Pin & Spin on a TV: the Fire TV app (Downloader + short link) or any TV browser.
// Addresses use this site's host, so a preview shows its own links.
export function TvSetupGuide() {
  const host = location.host;
  return <div className="guide tv-guide">
    <section>
      <h3>🔥 Amazon Fire TV / Fire Stick <span className="guide-tag">best</span></h3>
      <p className="guide-note">Install the free Pin &amp; Spin TV app once (about 5 minutes):</p>
      <ol>
        <li>On the Fire TV: <b>Settings → My Fire TV → About</b>. Click your device name <b>7 times</b> until it says you are a developer.</li>
        <li>Search for and install the free <b>Downloader</b> app (orange icon).</li>
        <li><b>Settings → My Fire TV → Developer Options → Install unknown apps</b> → turn on <b>Downloader</b>.</li>
        <li>Open Downloader, type <code className="guide-link">{host}/app</code>, press <b>Go</b>, then <b>Install</b>.</li>
        <li>Open <b>Pin &amp; Spin TV</b> from your apps. It shows a 4-letter code.</li>
      </ol>
      <p className="guide-note">Google TV / Android TV: the same steps and link work with Downloader.</p>
    </section>
    <section>
      <h3>📺 Samsung, LG or any TV with a web browser</h3>
      <ol>
        <li>Open the TV’s web browser and go to <code className="guide-link">{host}/tv</code> (bookmark it).</li>
        <li>Press <b>Start sound &amp; full screen</b> once with the remote.</li>
      </ol>
    </section>
    <section>
      <h3>💻 Laptop plugged into the TV</h3>
      <p className="guide-note">Open <code className="guide-link">{host}/tv</code> in any browser on the laptop.</p>
    </section>
    <section>
      <h3>📱 Then connect it to your room</h3>
      <p className="guide-note">On your phone, in the room, tap <b>📺 Show on TV</b> and type the 4-letter code from the TV.
        The TV only shows the board: players keep playing on their phones. Several TVs can show the same room.</p>
    </section>
    <p className="guide-note small">Roku and Apple TV have no web browser yet: use a laptop or a Fire TV Stick.</p>
  </div>;
}

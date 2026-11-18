import { useState } from "react";
import {
  Chat,
  ChatToggle,
  DisconnectButton,
  GridLayout,
  MediaDeviceMenu,
  TrackToggle,
  LayoutContextProvider,
  ParticipantTile,
  useCreateLayoutContext,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";

import { BlurToggle } from "./BlurToggle";

// Grade de vídeo + controles + chat, como o VideoConference do LiveKit, mas sem o agente do coach
// (participante de transcrição) aparecendo como um quadrado vazio na sala.
export function ConferenceStage() {
  const layout = useCreateLayoutContext();
  const [showChat, setShowChat] = useState(false);
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  ).filter((t) => !t.participant.isAgent);

  return (
    <LayoutContextProvider value={layout} onWidgetChange={(w) => setShowChat(w.showChat)}>
      <div className="lk-video-conference h-full">
        <div className="lk-video-conference-inner">
          <div className="lk-grid-layout-wrapper">
            <GridLayout tracks={tracks}>
              <ParticipantTile />
            </GridLayout>
          </div>
          {/* Barra de controles em português (o ControlBar do LiveKit só fala inglês). */}
          <div className="lk-control-bar" role="toolbar" aria-label="Controles da reunião">
            <div className="lk-button-group">
              <TrackToggle source={Track.Source.Microphone}>Microfone</TrackToggle>
              <div className="lk-button-group-menu">
                <MediaDeviceMenu kind="audioinput" aria-label="Escolher microfone" />
              </div>
            </div>
            <div className="lk-button-group">
              <TrackToggle source={Track.Source.Camera}>Câmera</TrackToggle>
              <div className="lk-button-group-menu">
                <MediaDeviceMenu kind="videoinput" aria-label="Escolher câmera" />
              </div>
            </div>
            <BlurToggle />
            <TrackToggle
              source={Track.Source.ScreenShare}
              captureOptions={{ audio: true, selfBrowserSurface: "include" }}
            >
              Compartilhar tela
            </TrackToggle>
            <ChatToggle>Chat</ChatToggle>
            <DisconnectButton>Sair</DisconnectButton>
          </div>
        </div>
        <Chat style={{ display: showChat ? "grid" : "none" }} />
      </div>
    </LayoutContextProvider>
  );
}

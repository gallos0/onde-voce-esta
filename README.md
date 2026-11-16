ONDE VOCÊ ESTÁ?
================

Jogo bíblico de "achar o personagem" no estilo *Onde está Wally?*, num mundo pintado que vai sendo liberado região por região.

- **index.html**: versão principal. Cada fase é uma pintura digital (25 cenas) com vida própria: vento nas folhas, água correndo, dia e noite, chuva, neblina, tempestade, animais andando e os personagens escondidos atrás da vegetação. Roda em WebGL1, leve para celulares, e fica salva para jogar offline depois da primeira visita.
- **3d.html**: a versão 3D anterior (three.js / WebGL2).
- **classico.html**: a versão clássica mais leve.

História em 35 fases:
- 1 a 19: do Jardim do Éden à terra a leste do Éden. Visitas de Deus a cada sequência sem erros (5ª, 15ª, 25ª…); na visita do 15º acerto, Deus traz Eva.
- 20: cena da tentação (Eva, a serpente, o fruto e Adão) e a queda: o jardim seca diante do jogador.
- 21 a 25: o jardim caído (árvores secas, terra rachada, animais magros), dificuldade extrema.
- 26 a 29: chegam Caim e Abel; é preciso achar os quatro.
- 30: missão de esconder Abel de Caim por 10 segundos, com dois desfechos.
- 31 a 34: só o irmão que ficou.
- 35: a expulsão do jardim e o fim.

As pinturas foram geradas por código: o mundo 3D do jogo é renderizado offline em várias camadas (cor, luz do sol, normais, profundidade), repintado por um pipeline próprio (céu pintado, névoa, raios de luz, oclusão) e finalizado com um modelo de estilo de pintura (AnimeGANv2 "Paprika", liberado para uso não comercial).

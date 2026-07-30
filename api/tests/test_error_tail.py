"""ErrorTail — o painel de erro do render precisa mostrar a causa, não só o trace.

Um "render vertical9x16 retornou 1" chegou ao usuário com o log cheio de quadros
de stack trace e nenhuma linha explicando a falha: a janela curta de linhas finais
tinha expulsado a mensagem.
"""

from pathlib import Path

from api.render import ErrorTail, parece_erro


# recorte fiel do que o Remotion emitiu, com as cores ANSI que ele usa
TRACE = [
    "\x1b[31m    at onMessage (C:\\...\\compositor.js:68:47)\x1b[39m",
    "\x1b[31m    at processInput (C:\\...\\make-streamer.js:81:9)\x1b[39m",
    "\x1b[31m    at Socket.onData (C:\\...\\make-streamer.js:104:9)\x1b[39m",
    "\x1b[31m    at Socket.emit (node:events:508:28)\x1b[39m",
    "\x1b[31m    at addChunk (node:internal/streams/readable:563:12)\x1b[39m",
    "\x1b[31m    at Readable.push (node:internal/streams/readable:394:5)\x1b[39m",
    "\x1b[31m    at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)\x1b[39m",
]


class TestPareceErro:
    def test_reconhece_a_mensagem_de_erro(self):
        assert parece_erro("Error: Compositor exited with code 1")
        assert parece_erro("TypeError: cannot read property 'x' of undefined")

    def test_reconhece_mesmo_com_cor_ansi(self):
        assert parece_erro("\x1b[31mError: alguma coisa quebrou\x1b[39m")

    def test_reconhece_falta_de_recurso(self):
        assert parece_erro("terminated: out of memory")
        assert parece_erro("write ENOSPC")

    def test_nao_confunde_quadro_de_trace_com_mensagem(self):
        for linha in TRACE:
            assert not parece_erro(linha), linha

    def test_nao_confunde_linha_comum(self):
        assert not parece_erro("Rendered 30/1532")
        assert not parece_erro("Bundling Remotion project...")


class TestErrorTail:
    def test_a_mensagem_sobrevive_ao_trace_que_a_expulsou(self):
        # janela menor que o trace: sem tratamento, a mensagem sumiria
        tail = ErrorTail(maxlen=5)
        tail.add("Error: Compositor exited with code 1")
        for linha in TRACE:
            tail.add(linha)

        saida = tail.render()
        assert "Error: Compositor exited with code 1" in saida
        # e o fim do trace continua junto, para dar contexto
        assert "Pipe.onStreamRead" in saida

    def test_nao_duplica_quando_a_mensagem_ainda_esta_na_janela(self):
        tail = ErrorTail(maxlen=10)
        tail.add("Error: quebrou")
        tail.add("    at algo (x.js:1:1)")
        assert tail.render().count("Error: quebrou") == 1

    def test_sem_erro_reconhecivel_mostra_so_o_fim(self):
        tail = ErrorTail(maxlen=3)
        for i in range(10):
            tail.add(f"linha {i}")
        saida = tail.render()
        assert saida.splitlines() == ["linha 7", "linha 8", "linha 9"]

    def test_aponta_o_arquivo_com_a_saida_completa(self):
        tail = ErrorTail()
        tail.add("Error: quebrou")
        saida = tail.render(Path("jobs/A2/render.log"))
        assert "render.log" in saida

    def test_render_vazio_nao_estoura(self):
        assert ErrorTail().render() == ""

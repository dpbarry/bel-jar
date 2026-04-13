open Js_of_ocaml
open Beluga
open Beluga_syntax.Syncom

type session =
  { state : Command.state
  ; buf : Buffer.t
  ; ppf : Format.formatter
  }

let drain session =
  Format.pp_print_flush session.ppf ();
  let s = Buffer.contents session.buf in
  Buffer.clear session.buf;
  s

let create () =
  let buf = Buffer.create 4096 in
  let ppf = Format.formatter_of_buffer buf in
  Logic.Options.more_solutions_prompt := (fun () -> false);
  Chatter.level := 1;
  let state = Command.create_initial_state ~ppf () in
  { state; buf; ppf }

let load_from_string session content =
  try
    ignore
      (Command.load_from_string session.state ~virtual_filename:"input.bel"
         ~content : Synint.Sgn.sgn);
    drain session
  with e ->
    let bt = Printexc.get_backtrace () in
    let msg =
      try Format.asprintf "%t" (Error.find_printer e)
      with _ -> Printexc.to_string e
    in
    Buffer.clear session.buf;
    msg ^ "\n" ^ bt

let run_command session input =
  try
    Command.interpret_command session.state ~input;
    drain session
  with e ->
    let msg =
      try Format.asprintf "%t" (Error.find_printer e)
      with _ -> Printexc.to_string e
    in
    Buffer.clear session.buf;
    msg

let () =
  Printexc.record_backtrace true;
  let session = ref (create ()) in
  Js.export "Beluga"
    (object%js
       method create =
         session := create ();
         Js.string "Beluga session created."

       method loadFromString content =
         let s = Js.to_string content in
         Js.string (load_from_string !session s)

       method runCommand input =
         let s = Js.to_string input in
         Js.string (run_command !session s)

       method reset =
         session := create ();
         Js.string "Session reset."
    end)

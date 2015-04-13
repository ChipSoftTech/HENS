(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                  //
// packages/jsparse/lexer.js                                                                        //
//                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                    //
var regexEscape = function (str) {                                                                  // 1
  return str.replace(/[\][^$\\.*+?(){}|]/g, '\\$&');                                                // 2
};                                                                                                  // 3
                                                                                                    // 4
// Adapted from source code of http://xregexp.com/plugins/#unicode                                  // 5
var unicodeCategories = {                                                                           // 6
  Ll: "0061-007A00B500DF-00F600F8-00FF01010103010501070109010B010D010F01110113011501170119011B011D011F01210123012501270129012B012D012F01310133013501370138013A013C013E014001420144014601480149014B014D014F01510153015501570159015B015D015F01610163016501670169016B016D016F0171017301750177017A017C017E-0180018301850188018C018D019201950199-019B019E01A101A301A501A801AA01AB01AD01B001B401B601B901BA01BD-01BF01C601C901CC01CE01D001D201D401D601D801DA01DC01DD01DF01E101E301E501E701E901EB01ED01EF01F001F301F501F901FB01FD01FF02010203020502070209020B020D020F02110213021502170219021B021D021F02210223022502270229022B022D022F02310233-0239023C023F0240024202470249024B024D024F-02930295-02AF037103730377037B-037D039003AC-03CE03D003D103D5-03D703D903DB03DD03DF03E103E303E503E703E903EB03ED03EF-03F303F503F803FB03FC0430-045F04610463046504670469046B046D046F04710473047504770479047B047D047F0481048B048D048F04910493049504970499049B049D049F04A104A304A504A704A904AB04AD04AF04B104B304B504B704B904BB04BD04BF04C204C404C604C804CA04CC04CE04CF04D104D304D504D704D904DB04DD04DF04E104E304E504E704E904EB04ED04EF04F104F304F504F704F904FB04FD04FF05010503050505070509050B050D050F05110513051505170519051B051D051F05210523052505270561-05871D00-1D2B1D6B-1D771D79-1D9A1E011E031E051E071E091E0B1E0D1E0F1E111E131E151E171E191E1B1E1D1E1F1E211E231E251E271E291E2B1E2D1E2F1E311E331E351E371E391E3B1E3D1E3F1E411E431E451E471E491E4B1E4D1E4F1E511E531E551E571E591E5B1E5D1E5F1E611E631E651E671E691E6B1E6D1E6F1E711E731E751E771E791E7B1E7D1E7F1E811E831E851E871E891E8B1E8D1E8F1E911E931E95-1E9D1E9F1EA11EA31EA51EA71EA91EAB1EAD1EAF1EB11EB31EB51EB71EB91EBB1EBD1EBF1EC11EC31EC51EC71EC91ECB1ECD1ECF1ED11ED31ED51ED71ED91EDB1EDD1EDF1EE11EE31EE51EE71EE91EEB1EED1EEF1EF11EF31EF51EF71EF91EFB1EFD1EFF-1F071F10-1F151F20-1F271F30-1F371F40-1F451F50-1F571F60-1F671F70-1F7D1F80-1F871F90-1F971FA0-1FA71FB0-1FB41FB61FB71FBE1FC2-1FC41FC61FC71FD0-1FD31FD61FD71FE0-1FE71FF2-1FF41FF61FF7210A210E210F2113212F21342139213C213D2146-2149214E21842C30-2C5E2C612C652C662C682C6A2C6C2C712C732C742C76-2C7B2C812C832C852C872C892C8B2C8D2C8F2C912C932C952C972C992C9B2C9D2C9F2CA12CA32CA52CA72CA92CAB2CAD2CAF2CB12CB32CB52CB72CB92CBB2CBD2CBF2CC12CC32CC52CC72CC92CCB2CCD2CCF2CD12CD32CD52CD72CD92CDB2CDD2CDF2CE12CE32CE42CEC2CEE2CF32D00-2D252D272D2DA641A643A645A647A649A64BA64DA64FA651A653A655A657A659A65BA65DA65FA661A663A665A667A669A66BA66DA681A683A685A687A689A68BA68DA68FA691A693A695A697A723A725A727A729A72BA72DA72F-A731A733A735A737A739A73BA73DA73FA741A743A745A747A749A74BA74DA74FA751A753A755A757A759A75BA75DA75FA761A763A765A767A769A76BA76DA76FA771-A778A77AA77CA77FA781A783A785A787A78CA78EA791A793A7A1A7A3A7A5A7A7A7A9A7FAFB00-FB06FB13-FB17FF41-FF5A",
  Lm: "02B0-02C102C6-02D102E0-02E402EC02EE0374037A0559064006E506E607F407F507FA081A0824082809710E460EC610FC17D718431AA71C78-1C7D1D2C-1D6A1D781D9B-1DBF2071207F2090-209C2C7C2C7D2D6F2E2F30053031-3035303B309D309E30FC-30FEA015A4F8-A4FDA60CA67FA717-A71FA770A788A7F8A7F9A9CFAA70AADDAAF3AAF4FF70FF9EFF9F",
  Lo: "00AA00BA01BB01C0-01C3029405D0-05EA05F0-05F20620-063F0641-064A066E066F0671-06D306D506EE06EF06FA-06FC06FF07100712-072F074D-07A507B107CA-07EA0800-08150840-085808A008A2-08AC0904-0939093D09500958-09610972-09770979-097F0985-098C098F09900993-09A809AA-09B009B209B6-09B909BD09CE09DC09DD09DF-09E109F009F10A05-0A0A0A0F0A100A13-0A280A2A-0A300A320A330A350A360A380A390A59-0A5C0A5E0A72-0A740A85-0A8D0A8F-0A910A93-0AA80AAA-0AB00AB20AB30AB5-0AB90ABD0AD00AE00AE10B05-0B0C0B0F0B100B13-0B280B2A-0B300B320B330B35-0B390B3D0B5C0B5D0B5F-0B610B710B830B85-0B8A0B8E-0B900B92-0B950B990B9A0B9C0B9E0B9F0BA30BA40BA8-0BAA0BAE-0BB90BD00C05-0C0C0C0E-0C100C12-0C280C2A-0C330C35-0C390C3D0C580C590C600C610C85-0C8C0C8E-0C900C92-0CA80CAA-0CB30CB5-0CB90CBD0CDE0CE00CE10CF10CF20D05-0D0C0D0E-0D100D12-0D3A0D3D0D4E0D600D610D7A-0D7F0D85-0D960D9A-0DB10DB3-0DBB0DBD0DC0-0DC60E01-0E300E320E330E40-0E450E810E820E840E870E880E8A0E8D0E94-0E970E99-0E9F0EA1-0EA30EA50EA70EAA0EAB0EAD-0EB00EB20EB30EBD0EC0-0EC40EDC-0EDF0F000F40-0F470F49-0F6C0F88-0F8C1000-102A103F1050-1055105A-105D106110651066106E-10701075-1081108E10D0-10FA10FD-1248124A-124D1250-12561258125A-125D1260-1288128A-128D1290-12B012B2-12B512B8-12BE12C012C2-12C512C8-12D612D8-13101312-13151318-135A1380-138F13A0-13F41401-166C166F-167F1681-169A16A0-16EA1700-170C170E-17111720-17311740-17511760-176C176E-17701780-17B317DC1820-18421844-18771880-18A818AA18B0-18F51900-191C1950-196D1970-19741980-19AB19C1-19C71A00-1A161A20-1A541B05-1B331B45-1B4B1B83-1BA01BAE1BAF1BBA-1BE51C00-1C231C4D-1C4F1C5A-1C771CE9-1CEC1CEE-1CF11CF51CF62135-21382D30-2D672D80-2D962DA0-2DA62DA8-2DAE2DB0-2DB62DB8-2DBE2DC0-2DC62DC8-2DCE2DD0-2DD62DD8-2DDE3006303C3041-3096309F30A1-30FA30FF3105-312D3131-318E31A0-31BA31F0-31FF3400-4DB54E00-9FCCA000-A014A016-A48CA4D0-A4F7A500-A60BA610-A61FA62AA62BA66EA6A0-A6E5A7FB-A801A803-A805A807-A80AA80C-A822A840-A873A882-A8B3A8F2-A8F7A8FBA90A-A925A930-A946A960-A97CA984-A9B2AA00-AA28AA40-AA42AA44-AA4BAA60-AA6FAA71-AA76AA7AAA80-AAAFAAB1AAB5AAB6AAB9-AABDAAC0AAC2AADBAADCAAE0-AAEAAAF2AB01-AB06AB09-AB0EAB11-AB16AB20-AB26AB28-AB2EABC0-ABE2AC00-D7A3D7B0-D7C6D7CB-D7FBF900-FA6DFA70-FAD9FB1DFB1F-FB28FB2A-FB36FB38-FB3CFB3EFB40FB41FB43FB44FB46-FBB1FBD3-FD3DFD50-FD8FFD92-FDC7FDF0-FDFBFE70-FE74FE76-FEFCFF66-FF6FFF71-FF9DFFA0-FFBEFFC2-FFC7FFCA-FFCFFFD2-FFD7FFDA-FFDC",
  Lt: "01C501C801CB01F21F88-1F8F1F98-1F9F1FA8-1FAF1FBC1FCC1FFC",                                    // 10
  Lu: "0041-005A00C0-00D600D8-00DE01000102010401060108010A010C010E01100112011401160118011A011C011E01200122012401260128012A012C012E01300132013401360139013B013D013F0141014301450147014A014C014E01500152015401560158015A015C015E01600162016401660168016A016C016E017001720174017601780179017B017D018101820184018601870189-018B018E-0191019301940196-0198019C019D019F01A001A201A401A601A701A901AC01AE01AF01B1-01B301B501B701B801BC01C401C701CA01CD01CF01D101D301D501D701D901DB01DE01E001E201E401E601E801EA01EC01EE01F101F401F6-01F801FA01FC01FE02000202020402060208020A020C020E02100212021402160218021A021C021E02200222022402260228022A022C022E02300232023A023B023D023E02410243-02460248024A024C024E03700372037603860388-038A038C038E038F0391-03A103A3-03AB03CF03D2-03D403D803DA03DC03DE03E003E203E403E603E803EA03EC03EE03F403F703F903FA03FD-042F04600462046404660468046A046C046E04700472047404760478047A047C047E0480048A048C048E04900492049404960498049A049C049E04A004A204A404A604A804AA04AC04AE04B004B204B404B604B804BA04BC04BE04C004C104C304C504C704C904CB04CD04D004D204D404D604D804DA04DC04DE04E004E204E404E604E804EA04EC04EE04F004F204F404F604F804FA04FC04FE05000502050405060508050A050C050E05100512051405160518051A051C051E05200522052405260531-055610A0-10C510C710CD1E001E021E041E061E081E0A1E0C1E0E1E101E121E141E161E181E1A1E1C1E1E1E201E221E241E261E281E2A1E2C1E2E1E301E321E341E361E381E3A1E3C1E3E1E401E421E441E461E481E4A1E4C1E4E1E501E521E541E561E581E5A1E5C1E5E1E601E621E641E661E681E6A1E6C1E6E1E701E721E741E761E781E7A1E7C1E7E1E801E821E841E861E881E8A1E8C1E8E1E901E921E941E9E1EA01EA21EA41EA61EA81EAA1EAC1EAE1EB01EB21EB41EB61EB81EBA1EBC1EBE1EC01EC21EC41EC61EC81ECA1ECC1ECE1ED01ED21ED41ED61ED81EDA1EDC1EDE1EE01EE21EE41EE61EE81EEA1EEC1EEE1EF01EF21EF41EF61EF81EFA1EFC1EFE1F08-1F0F1F18-1F1D1F28-1F2F1F38-1F3F1F48-1F4D1F591F5B1F5D1F5F1F68-1F6F1FB8-1FBB1FC8-1FCB1FD8-1FDB1FE8-1FEC1FF8-1FFB21022107210B-210D2110-211221152119-211D212421262128212A-212D2130-2133213E213F214521832C00-2C2E2C602C62-2C642C672C692C6B2C6D-2C702C722C752C7E-2C802C822C842C862C882C8A2C8C2C8E2C902C922C942C962C982C9A2C9C2C9E2CA02CA22CA42CA62CA82CAA2CAC2CAE2CB02CB22CB42CB62CB82CBA2CBC2CBE2CC02CC22CC42CC62CC82CCA2CCC2CCE2CD02CD22CD42CD62CD82CDA2CDC2CDE2CE02CE22CEB2CED2CF2A640A642A644A646A648A64AA64CA64EA650A652A654A656A658A65AA65CA65EA660A662A664A666A668A66AA66CA680A682A684A686A688A68AA68CA68EA690A692A694A696A722A724A726A728A72AA72CA72EA732A734A736A738A73AA73CA73EA740A742A744A746A748A74AA74CA74EA750A752A754A756A758A75AA75CA75EA760A762A764A766A768A76AA76CA76EA779A77BA77DA77EA780A782A784A786A78BA78DA790A792A7A0A7A2A7A4A7A6A7A8A7AAFF21-FF3A",
  Mc: "0903093B093E-09400949-094C094E094F0982098309BE-09C009C709C809CB09CC09D70A030A3E-0A400A830ABE-0AC00AC90ACB0ACC0B020B030B3E0B400B470B480B4B0B4C0B570BBE0BBF0BC10BC20BC6-0BC80BCA-0BCC0BD70C01-0C030C41-0C440C820C830CBE0CC0-0CC40CC70CC80CCA0CCB0CD50CD60D020D030D3E-0D400D46-0D480D4A-0D4C0D570D820D830DCF-0DD10DD8-0DDF0DF20DF30F3E0F3F0F7F102B102C10311038103B103C105610571062-10641067-106D108310841087-108C108F109A-109C17B617BE-17C517C717C81923-19261929-192B193019311933-193819B0-19C019C819C91A19-1A1B1A551A571A611A631A641A6D-1A721B041B351B3B1B3D-1B411B431B441B821BA11BA61BA71BAA1BAC1BAD1BE71BEA-1BEC1BEE1BF21BF31C24-1C2B1C341C351CE11CF21CF3302E302FA823A824A827A880A881A8B4-A8C3A952A953A983A9B4A9B5A9BAA9BBA9BD-A9C0AA2FAA30AA33AA34AA4DAA7BAAEBAAEEAAEFAAF5ABE3ABE4ABE6ABE7ABE9ABEAABEC",
  Mn: "0300-036F0483-04870591-05BD05BF05C105C205C405C505C70610-061A064B-065F067006D6-06DC06DF-06E406E706E806EA-06ED07110730-074A07A6-07B007EB-07F30816-0819081B-08230825-08270829-082D0859-085B08E4-08FE0900-0902093A093C0941-0948094D0951-095709620963098109BC09C1-09C409CD09E209E30A010A020A3C0A410A420A470A480A4B-0A4D0A510A700A710A750A810A820ABC0AC1-0AC50AC70AC80ACD0AE20AE30B010B3C0B3F0B41-0B440B4D0B560B620B630B820BC00BCD0C3E-0C400C46-0C480C4A-0C4D0C550C560C620C630CBC0CBF0CC60CCC0CCD0CE20CE30D41-0D440D4D0D620D630DCA0DD2-0DD40DD60E310E34-0E3A0E47-0E4E0EB10EB4-0EB90EBB0EBC0EC8-0ECD0F180F190F350F370F390F71-0F7E0F80-0F840F860F870F8D-0F970F99-0FBC0FC6102D-10301032-10371039103A103D103E10581059105E-10601071-1074108210851086108D109D135D-135F1712-17141732-1734175217531772177317B417B517B7-17BD17C617C9-17D317DD180B-180D18A91920-19221927192819321939-193B1A171A181A561A58-1A5E1A601A621A65-1A6C1A73-1A7C1A7F1B00-1B031B341B36-1B3A1B3C1B421B6B-1B731B801B811BA2-1BA51BA81BA91BAB1BE61BE81BE91BED1BEF-1BF11C2C-1C331C361C371CD0-1CD21CD4-1CE01CE2-1CE81CED1CF41DC0-1DE61DFC-1DFF20D0-20DC20E120E5-20F02CEF-2CF12D7F2DE0-2DFF302A-302D3099309AA66FA674-A67DA69FA6F0A6F1A802A806A80BA825A826A8C4A8E0-A8F1A926-A92DA947-A951A980-A982A9B3A9B6-A9B9A9BCAA29-AA2EAA31AA32AA35AA36AA43AA4CAAB0AAB2-AAB4AAB7AAB8AABEAABFAAC1AAECAAEDAAF6ABE5ABE8ABEDFB1EFE00-FE0FFE20-FE26",
  Nd: "0030-00390660-066906F0-06F907C0-07C90966-096F09E6-09EF0A66-0A6F0AE6-0AEF0B66-0B6F0BE6-0BEF0C66-0C6F0CE6-0CEF0D66-0D6F0E50-0E590ED0-0ED90F20-0F291040-10491090-109917E0-17E91810-18191946-194F19D0-19D91A80-1A891A90-1A991B50-1B591BB0-1BB91C40-1C491C50-1C59A620-A629A8D0-A8D9A900-A909A9D0-A9D9AA50-AA59ABF0-ABF9FF10-FF19",
  Nl: "16EE-16F02160-21822185-218830073021-30293038-303AA6E6-A6EF",                                 // 15
  Pc: "005F203F20402054FE33FE34FE4D-FE4FFF3F"                                                       // 16
};                                                                                                  // 17
                                                                                                    // 18
var unicodeClass = function (abbrev) {                                                              // 19
  return '[' +                                                                                      // 20
    unicodeCategories[abbrev].replace(/[0-9A-F]{4}/ig, "\\u$&") + ']';                              // 21
};                                                                                                  // 22
                                                                                                    // 23
// See ECMA-262 spec, 3rd edition, section 7                                                        // 24
                                                                                                    // 25
// Section 7.2                                                                                      // 26
// Match one or more characters of whitespace, excluding line terminators.                          // 27
// Do this by matching reluctantly, stopping at a non-dot (line terminator                          // 28
// or end of string) or a non-whitespace.                                                           // 29
// We are taking advantage of the fact that we are parsing JS from JS in                            // 30
// regexes like this by "passing through" the spec's definition of whitespace,                      // 31
// which is the same in regexes and the lexical grammar.                                            // 32
var rWhiteSpace = /[^\S\u000A\u000D\u2028\u2029]+/g;                                                // 33
// Section 7.3                                                                                      // 34
// Match one line terminator.  Same as (?!.)[\s\S] but more explicit.                               // 35
var rLineTerminator = /[\u000A\u000D\u2028\u2029]/g;                                                // 36
// Section 7.4                                                                                      // 37
// Match one multi-line comment.                                                                    // 38
// [\s\S] is shorthand for any character, including newlines.                                       // 39
// The *? reluctant qualifier makes this easy.                                                      // 40
var rMultiLineComment = /\/\*[\s\S]*?\*\//g;                                                        // 41
// Match one single-line comment, not including the line terminator.                                // 42
var rSingleLineComment = /\/\/.*/g;                                                                 // 43
// Section 7.6                                                                                      // 44
// Match one or more characters that can start an identifier.                                       // 45
// This is IdentifierStart+.                                                                        // 46
var rIdentifierPrefix = new RegExp(                                                                 // 47
  "([a-zA-Z$_]+|\\\\u[0-9a-fA-F]{4}|" +                                                             // 48
    [unicodeClass('Lu'), unicodeClass('Ll'), unicodeClass('Lt'),                                    // 49
     unicodeClass('Lm'), unicodeClass('Lo'), unicodeClass('Nl')].join('|') +                        // 50
    ")+", 'g');                                                                                     // 51
// Match one or more characters that can continue an identifier.                                    // 52
// This is (IdentifierPart and not IdentifierStart)+.                                               // 53
// To match a full identifier, match rIdentifierPrefix, then                                        // 54
// match rIdentifierMiddle followed by rIdentifierPrefix until they both fail.                      // 55
var rIdentifierMiddle = new RegExp(                                                                 // 56
  "([0-9]|" + [unicodeClass('Mn'), unicodeClass('Mc'), unicodeClass('Nd'),                          // 57
               unicodeClass('Pc')].join('|') + ")+", 'g');                                          // 58
// Section 7.7                                                                                      // 59
// Match one punctuator (except for division punctuators).                                          // 60
var rPunctuator = new RegExp(                                                                       // 61
  regexEscape("{ } ( ) [ ] . ; , < > <= >= == != === !== + - * % ++ -- << >> "+                     // 62
              ">>> & | ^ ! ~ && || ? : = += -= *= %= <<= >>= >>>= &= |= ^=")                        // 63
  // sort from longest to shortest so that we don't match '==' for '===' and                        // 64
  // '*' for '*=', etc.                                                                             // 65
    .split(' ').sort(function (a,b) { return b.length - a.length; })                                // 66
    .join('|'), 'g');                                                                               // 67
var rDivPunctuator = /\/=?/g;                                                                       // 68
// Section 7.8.3                                                                                    // 69
var rHexLiteral = /0[xX][0-9a-fA-F]+(?!\w)/g;                                                       // 70
var rOctLiteral = /0[0-7]+(?!\w)/g; // deprecated                                                   // 71
var rDecLiteral =                                                                                   // 72
      /(((0|[1-9][0-9]*)(\.[0-9]*)?)|\.[0-9]+)([Ee][+-]?[0-9]+)?(?!\w)/g;                           // 73
// Section 7.8.4                                                                                    // 74
var rStringQuote = /["']/g;                                                                         // 75
// Match one or more characters besides quotes, backslashes, or line ends                           // 76
var rStringMiddle = /(?=.)[^"'\\]+?((?!.)|(?=["'\\]))/g;                                            // 77
// Match one escape sequence, including the backslash.                                              // 78
var rEscapeSequence =                                                                               // 79
      /\\(['"\\bfnrtv]|0(?![0-9])|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|(?=.)[^ux0-9])/g;                 // 80
// Match one ES5 line continuation                                                                  // 81
var rLineContinuation =                                                                             // 82
      /\\(\r\n|[\u000A\u000D\u2028\u2029])/g;                                                       // 83
// Section 7.8.5                                                                                    // 84
// Match one regex literal, including slashes, not including flags.                                 // 85
// Support unescaped '/' in character classes, per 5th ed.                                          // 86
// For example: `/[/]/` will match the string `"/"`.                                                // 87
//                                                                                                  // 88
// Explanation of regex:                                                                            // 89
// - Match `/` not followed by `/` or `*`                                                           // 90
// - Match one or more of any of these:                                                             // 91
//   - Backslash followed by one non-newline                                                        // 92
//   - One non-newline, not `[` or `\` or `/`                                                       // 93
//   - A character class, beginning with `[` and ending with `]`.                                   // 94
//     In the middle is zero or more of any of these:                                               // 95
//     - Backslash followed by one non-newline                                                      // 96
//     - One non-newline, not `]` or `\`                                                            // 97
// - Match closing `/`                                                                              // 98
var rRegexLiteral =                                                                                 // 99
      /\/(?![*\/])(\\.|(?=.)[^\[\/\\]|\[(\\.|(?=.)[^\]\\])*\])+\//g;                                // 100
var rRegexFlags = /[a-zA-Z]*/g;                                                                     // 101
                                                                                                    // 102
var rDecider =                                                                                      // 103
      /((?=.)\s)|(\/[\/\*]?)|([\][{}();,<>=!+*%&|^~?:-]|\.(?![0-9]))|([\d.])|(["'])|(.)|([\S\s])/g; // 104
                                                                                                    // 105
var keywordLookup = {                                                                               // 106
  ' break': 'KEYWORD',                                                                              // 107
  ' case': 'KEYWORD',                                                                               // 108
  ' catch': 'KEYWORD',                                                                              // 109
  ' continue': 'KEYWORD',                                                                           // 110
  ' debugger': 'KEYWORD',                                                                           // 111
  ' default': 'KEYWORD',                                                                            // 112
  ' delete': 'KEYWORD',                                                                             // 113
  ' do': 'KEYWORD',                                                                                 // 114
  ' else': 'KEYWORD',                                                                               // 115
  ' finally': 'KEYWORD',                                                                            // 116
  ' for': 'KEYWORD',                                                                                // 117
  ' function': 'KEYWORD',                                                                           // 118
  ' if': 'KEYWORD',                                                                                 // 119
  ' in': 'KEYWORD',                                                                                 // 120
  ' instanceof': 'KEYWORD',                                                                         // 121
  ' new': 'KEYWORD',                                                                                // 122
  ' return': 'KEYWORD',                                                                             // 123
  ' switch': 'KEYWORD',                                                                             // 124
  ' this': 'KEYWORD',                                                                               // 125
  ' throw': 'KEYWORD',                                                                              // 126
  ' try': 'KEYWORD',                                                                                // 127
  ' typeof': 'KEYWORD',                                                                             // 128
  ' var': 'KEYWORD',                                                                                // 129
  ' void': 'KEYWORD',                                                                               // 130
  ' while': 'KEYWORD',                                                                              // 131
  ' with': 'KEYWORD',                                                                               // 132
                                                                                                    // 133
  ' false': 'BOOLEAN',                                                                              // 134
  ' true': 'BOOLEAN',                                                                               // 135
                                                                                                    // 136
  ' null': 'NULL'                                                                                   // 137
};                                                                                                  // 138
                                                                                                    // 139
var makeSet = function (array) {                                                                    // 140
  var s = {};                                                                                       // 141
  for (var i = 0, N = array.length; i < N; i++)                                                     // 142
    s[array[i]] = true;                                                                             // 143
  return s;                                                                                         // 144
};                                                                                                  // 145
                                                                                                    // 146
var nonTokenTypes = makeSet('WHITESPACE COMMENT NEWLINE EOF ERROR'.split(' '));                     // 147
                                                                                                    // 148
var punctuationBeforeDivision = makeSet('] ) } ++ --'.split(' '));                                  // 149
var keywordsBeforeDivision = makeSet('this'.split(' '));                                            // 150
                                                                                                    // 151
var guessIsDivisionPermittedAfterToken = function (tok) {                                           // 152
  // Figure out if a '/' character should be interpreted as division                                // 153
  // rather than the start of a regular expression when it follows the                              // 154
  // token, which must be a token lexeme per isToken().                                             // 155
  // The beginning of section 7 of the spec briefly                                                 // 156
  // explains what's going on; basically the lexical grammar can't                                  // 157
  // distinguish, for example, `e/f/g` (division) from `e=/f/g`                                     // 158
  // (assignment of a regular expression), among many other variations.                             // 159
  //                                                                                                // 160
  // THIS IS ONLY A HEURISTIC, though it will rarely fail.                                          // 161
  // Here are the two cases I know of where help from the parser is needed:                         // 162
  //  - if (foo)                                                                                    // 163
  //        /ba/.test("banana") && console.log("matches");                                          // 164
  //    (Close paren of a control structure before a statement starting with                        // 165
  //     a regex literal.  Starting a statement with a regex literal is                             // 166
  //     unusual, of course, because it's hard to have a side effect.)                              // 167
  //  - ++ /foo/.abc                                                                                // 168
  //    (Prefix `++` or `--` before an expression starting with a regex                             // 169
  //     literal.  This will run but I can't see any use for it.)                                   // 170
  switch (tok.type()) {                                                                             // 171
  case "PUNCTUATION":                                                                               // 172
    // few punctuators can end an expression, but e.g. `)`                                          // 173
    return !! punctuationBeforeDivision[tok.text()];                                                // 174
  case "KEYWORD":                                                                                   // 175
    // few keywords can end an expression, but e.g. `this`                                          // 176
    return !! keywordsBeforeDivision[tok.text()];                                                   // 177
  case "IDENTIFIER":                                                                                // 178
    return true;                                                                                    // 179
  default: // literal                                                                               // 180
    return true;                                                                                    // 181
  }                                                                                                 // 182
};                                                                                                  // 183
                                                                                                    // 184
////////// PUBLIC API                                                                               // 185
                                                                                                    // 186
var Lexeme = function (pos, type, text) {                                                           // 187
  this._pos = pos;                                                                                  // 188
  this._type = type;                                                                                // 189
  this._text = text;                                                                                // 190
};                                                                                                  // 191
                                                                                                    // 192
Lexeme.prototype.startPos = function () {                                                           // 193
  return this._pos;                                                                                 // 194
};                                                                                                  // 195
                                                                                                    // 196
Lexeme.prototype.endPos = function () {                                                             // 197
  return this._pos + this._text.length;                                                             // 198
};                                                                                                  // 199
                                                                                                    // 200
Lexeme.prototype.type = function () {                                                               // 201
  return this._type;                                                                                // 202
};                                                                                                  // 203
                                                                                                    // 204
Lexeme.prototype.text = function () {                                                               // 205
  return this._text;                                                                                // 206
};                                                                                                  // 207
                                                                                                    // 208
Lexeme.prototype.isToken = function () {                                                            // 209
  return ! nonTokenTypes[this._type];                                                               // 210
};                                                                                                  // 211
                                                                                                    // 212
Lexeme.prototype.isError = function () {                                                            // 213
  return this._type === "ERROR";                                                                    // 214
};                                                                                                  // 215
                                                                                                    // 216
Lexeme.prototype.isEOF = function () {                                                              // 217
  return this._type === "EOF";                                                                      // 218
};                                                                                                  // 219
                                                                                                    // 220
Lexeme.prototype.prev = function () {                                                               // 221
  return this._prev;                                                                                // 222
};                                                                                                  // 223
                                                                                                    // 224
Lexeme.prototype.next = function () {                                                               // 225
  return this._next;                                                                                // 226
};                                                                                                  // 227
                                                                                                    // 228
Lexeme.prototype.toString = function () {                                                           // 229
  return this.isError() ? "ERROR" :                                                                 // 230
    this.isEOF() ? "EOF" : "`" + this.text() + "`";                                                 // 231
};                                                                                                  // 232
                                                                                                    // 233
// Create a Lexer for the given string of JavaScript code.                                          // 234
//                                                                                                  // 235
// A lexer keeps a pointer `pos` into the string that is                                            // 236
// advanced when you ask for the next lexeme with `next()`.                                         // 237
//                                                                                                  // 238
// XXXXX UPDATE DOCS                                                                                // 239
// Properties:                                                                                      // 240
//   code: Original JavaScript code string.                                                         // 241
//   pos:  Current index into the string.  You can assign to it                                     // 242
//           to continue lexing from a different position.  After                                   // 243
//           calling next(), it is the ending index of the most                                     // 244
//           recent lexeme.                                                                         // 245
//   lastPos:  The starting index of the most recent lexeme.                                        // 246
//           Equal to `pos - text.length`.                                                          // 247
//   text: Text of the last lexeme as a string.                                                     // 248
//   type: Type of the last lexeme, as returned by `next()`.                                        // 249
//   divisionPermitted: Whether a '/' character should be interpreted                               // 250
//           as division rather than the start of a regular expression.                             // 251
//           This flag is set automatically during lexing based on the                              // 252
//           previous token (i.e. the most recent token lexeme), but                                // 253
//           it is technically only a heuristic.                                                    // 254
//           Thie flag can be read and set manually to affect the                                   // 255
//           parsing of the next token.                                                             // 256
                                                                                                    // 257
JSLexer = function (code) {                                                                         // 258
  this.code = code;                                                                                 // 259
  this.pos = 0;                                                                                     // 260
  this.divisionPermitted = false;                                                                   // 261
  this.lastLexeme = null;                                                                           // 262
};                                                                                                  // 263
                                                                                                    // 264
JSLexer.Lexeme = Lexeme;                                                                            // 265
                                                                                                    // 266
// XXXX UPDATE DOCS                                                                                 // 267
// Return the type of the next of lexeme starting at `pos`, and advance                             // 268
// `pos` to the end of the lexeme.  The text of the lexeme is available                             // 269
// in `text`.  The text is always the substring of `code` between the                               // 270
// old and new values of `pos`.  An "EOF" lexeme terminates                                         // 271
// the stream.  "ERROR" lexemes indicate a bad input string.  Out of all                            // 272
// lexemes, only "EOF" has empty text, and it always has empty text.                                // 273
// All others contain at least one character from the source code.                                  // 274
//                                                                                                  // 275
// Lexeme types:                                                                                    // 276
// Literals: BOOLEAN, NULL, REGEX, NUMBER, STRING                                                   // 277
// Whitespace-like: WHITESPACE, COMMENT, NEWLINE, EOF                                               // 278
// Other Tokens: IDENTIFIER, KEYWORD, PUNCTUATION                                                   // 279
// ... and ERROR                                                                                    // 280
                                                                                                    // 281
JSLexer.prototype.next = function () {                                                              // 282
  var self = this;                                                                                  // 283
  var code = self.code;                                                                             // 284
  var origPos = self.pos;                                                                           // 285
  var divisionPermitted = self.divisionPermitted;                                                   // 286
                                                                                                    // 287
  if (origPos > code.length)                                                                        // 288
    throw new Error("out of range");                                                                // 289
                                                                                                    // 290
  // Running regexes inside this function will move this local                                      // 291
  // `pos` forward.                                                                                 // 292
  // When we commit to emitting a lexeme, we'll set self.pos                                        // 293
  // based on it.                                                                                   // 294
  var pos = origPos;                                                                                // 295
                                                                                                    // 296
  // Emit a lexeme.  Always called as `return lexeme(type)`.                                        // 297
  var lexeme = function (type) {                                                                    // 298
    // If `pos` hasn't moved, we consider this an error.                                            // 299
    // This means that grammar cases that only run one regex                                        // 300
    // or an alternation ('||') of regexes don't need to                                            // 301
    // check for failure.                                                                           // 302
    // This also guarantees that only EOF lexemes are empty.                                        // 303
    if (pos === origPos && type !== 'EOF') {                                                        // 304
      type = 'ERROR';                                                                               // 305
      pos = origPos + 1;                                                                            // 306
    }                                                                                               // 307
    self.pos = pos;                                                                                 // 308
    var lex = new JSLexer.Lexeme(origPos, type, code.substring(origPos, pos));                      // 309
    if (self.lastLexeme) {                                                                          // 310
      self.lastLexeme._next = lex;                                                                  // 311
      lex._prev = self.lastLexeme;                                                                  // 312
    }                                                                                               // 313
    self.lastLexeme = lex;                                                                          // 314
    if (lex.isToken())                                                                              // 315
      self.divisionPermitted = guessIsDivisionPermittedAfterToken(lex);                             // 316
    return lex;                                                                                     // 317
  };                                                                                                // 318
                                                                                                    // 319
  if (pos === code.length)                                                                          // 320
    return lexeme('EOF');                                                                           // 321
                                                                                                    // 322
  // Result of the regex match in the most recent call to `run`.                                    // 323
  var match = null;                                                                                 // 324
                                                                                                    // 325
  // Run a regex starting from `pos`, recording the end of the matched                              // 326
  // string in `pos` and the match data in `match`.  The regex must have                            // 327
  // the 'g' (global) flag.  If it doesn't match at `pos`, set `match`                              // 328
  // to null.  The caller should expect the regex to match at `pos`, as                             // 329
  // failure is too expensive to run in a tight loop.                                               // 330
  var run = function (regex) {                                                                      // 331
    // Cause regex matching to start at `pos`.                                                      // 332
    regex.lastIndex = pos;                                                                          // 333
    match = regex.exec(code);                                                                       // 334
    // Simulate "sticky" matching by throwing out the match if it                                   // 335
    // didn't match exactly at `pos`.  If it didn't, we may have                                    // 336
    // just searched the entire string.                                                             // 337
    if (match && (match.index !== pos))                                                             // 338
      match = null;                                                                                 // 339
    // Record the end position of the match back into `pos`.                                        // 340
    // Avoid an IE7 bug where lastIndex is incremented when                                         // 341
    // the match has 0 length.                                                                      // 342
    if (match && match[0].length !== 0)                                                             // 343
      pos = regex.lastIndex;                                                                        // 344
    return match;                                                                                   // 345
  };                                                                                                // 346
                                                                                                    // 347
  // Decide which case of the grammar we are in based on one or two                                 // 348
  // characters, then roll back `pos`.                                                              // 349
  run(rDecider);                                                                                    // 350
  pos = origPos;                                                                                    // 351
                                                                                                    // 352
  // Grammar cases                                                                                  // 353
  if (match[1]) { // \s                                                                             // 354
    run(rWhiteSpace);                                                                               // 355
    return lexeme('WHITESPACE');                                                                    // 356
  }                                                                                                 // 357
  if (match[2]) { // one of //, /*, /                                                               // 358
    if (match[2] === '//') {                                                                        // 359
      run(rSingleLineComment);                                                                      // 360
      return lexeme('COMMENT');                                                                     // 361
    }                                                                                               // 362
    if (match[2] === '/*') {                                                                        // 363
      run(rMultiLineComment);                                                                       // 364
      return lexeme(match ? 'COMMENT' : 'ERROR');                                                   // 365
    }                                                                                               // 366
    if (match[2] === '/') {                                                                         // 367
      if (divisionPermitted) {                                                                      // 368
        run(rDivPunctuator);                                                                        // 369
        return lexeme('PUNCTUATION');                                                               // 370
      } else {                                                                                      // 371
        run(rRegexLiteral);                                                                         // 372
        if (! match)                                                                                // 373
          return lexeme('ERROR');                                                                   // 374
        run(rRegexFlags);                                                                           // 375
        return lexeme('REGEX');                                                                     // 376
      }                                                                                             // 377
    }                                                                                               // 378
  }                                                                                                 // 379
  if (match[3]) { // any other punctuation char                                                     // 380
    run(rPunctuator);                                                                               // 381
    return lexeme(match ? 'PUNCTUATION' : 'ERROR');                                                 // 382
  }                                                                                                 // 383
  if (match[4]) { // 0-9                                                                            // 384
    run(rDecLiteral) || run(rHexLiteral) || run(rOctLiteral);                                       // 385
    return lexeme(match ? 'NUMBER' : 'ERROR');                                                      // 386
  }                                                                                                 // 387
  if (match[5]) { // " or '                                                                         // 388
    run(rStringQuote);                                                                              // 389
    var quote = match[0];                                                                           // 390
    do {                                                                                            // 391
      run(rStringMiddle) || run(rEscapeSequence) ||                                                 // 392
        run(rLineContinuation) || run(rStringQuote);                                                // 393
    } while (match && match[0] !== quote);                                                          // 394
    if (! (match && match[0] === quote))                                                            // 395
      return lexeme('ERROR');                                                                       // 396
    return lexeme('STRING');                                                                        // 397
  }                                                                                                 // 398
  if (match[7]) { // non-dot (line terminator)                                                      // 399
    run(rLineTerminator);                                                                           // 400
    return lexeme('NEWLINE');                                                                       // 401
  }                                                                                                 // 402
  // dot (any non-line-terminator)                                                                  // 403
  run(rIdentifierPrefix);                                                                           // 404
  // Use non-short-circuiting bitwise OR, '|', to always try                                        // 405
  // both regexes in sequence, returning false only if neither                                      // 406
  // matched.                                                                                       // 407
  while ((!! run(rIdentifierMiddle)) |                                                              // 408
         (!! run(rIdentifierPrefix))) { /*continue*/ }                                              // 409
  var word = code.substring(origPos, pos);                                                          // 410
  return lexeme(keywordLookup[' '+word] || 'IDENTIFIER');                                           // 411
};                                                                                                  // 412
                                                                                                    // 413
JSLexer.prettyOffset = function (code, pos) {                                                       // 414
  var codeUpToPos = code.substring(0, pos);                                                         // 415
  var startOfLine = codeUpToPos.lastIndexOf('\n') + 1;                                              // 416
  var indexInLine = pos - startOfLine; // 0-based                                                   // 417
  var lineNum = codeUpToPos.replace(/[^\n]+/g, '').length + 1; // 1-based                           // 418
  return "line " + lineNum + ", offset " + indexInLine;                                             // 419
};                                                                                                  // 420
                                                                                                    // 421
//////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                  //
// packages/jsparse/parserlib.js                                                                    //
//                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                    //
///// TOKENIZER AND PARSER COMBINATORS                                                              // 1
                                                                                                    // 2
// XXX track line/col position, for errors and maybe token info                                     // 3
                                                                                                    // 4
var isArray = function (obj) {                                                                      // 5
  return obj && (typeof obj === 'object') && (typeof obj.length === 'number');                      // 6
};                                                                                                  // 7
                                                                                                    // 8
ParseNode = function (name, children) {                                                             // 9
  this.name = name;                                                                                 // 10
  this.children = children;                                                                         // 11
                                                                                                    // 12
  if (! isArray(children))                                                                          // 13
    throw new Error("Expected array in new ParseNode(" + name + ", ...)");                          // 14
};                                                                                                  // 15
                                                                                                    // 16
                                                                                                    // 17
Parser = function (expecting, runFunc) {                                                            // 18
  this.expecting = expecting;                                                                       // 19
  this._run = runFunc;                                                                              // 20
};                                                                                                  // 21
                                                                                                    // 22
Parser.prototype.parse = function (t) {                                                             // 23
  return this._run(t);                                                                              // 24
};                                                                                                  // 25
                                                                                                    // 26
Parser.prototype.parseRequired = function (t) {                                                     // 27
  return this.parseRequiredIf(t, true);                                                             // 28
};                                                                                                  // 29
                                                                                                    // 30
Parser.prototype.parseRequiredIf = function (t, required) {                                         // 31
  var result = this._run(t);                                                                        // 32
                                                                                                    // 33
  if (required && ! result)                                                                         // 34
    throw t.getParseError(this.expecting);                                                          // 35
                                                                                                    // 36
  return result;                                                                                    // 37
};                                                                                                  // 38
                                                                                                    // 39
Parser.expecting = function (expecting, parser) {                                                   // 40
  return new Parser(expecting, parser._run);                                                        // 41
};                                                                                                  // 42
                                                                                                    // 43
                                                                                                    // 44
// A parser that consume()s has to succeed.                                                         // 45
// Similarly, a parser that fails can't have consumed.                                              // 46
                                                                                                    // 47
Parsers = {};                                                                                       // 48
                                                                                                    // 49
Parsers.assertion = function (test) {                                                               // 50
  return new Parser(                                                                                // 51
    null, function (t) {                                                                            // 52
      return test(t) ? [] : null;                                                                   // 53
    });                                                                                             // 54
};                                                                                                  // 55
                                                                                                    // 56
Parsers.node = function (name, childrenParser) {                                                    // 57
  return new Parser(name, function (t) {                                                            // 58
    var children = childrenParser.parse(t);                                                         // 59
    if (! children)                                                                                 // 60
      return null;                                                                                  // 61
    if (! isArray(children))                                                                        // 62
      children = [children];                                                                        // 63
    return new ParseNode(name, children);                                                           // 64
  });                                                                                               // 65
};                                                                                                  // 66
                                                                                                    // 67
Parsers.or = function (/*parsers*/) {                                                               // 68
  var args = arguments;                                                                             // 69
  return new Parser(                                                                                // 70
    args[args.length - 1].expecting,                                                                // 71
    function (t) {                                                                                  // 72
      var result;                                                                                   // 73
      for(var i = 0, N = args.length; i < N; i++) {                                                 // 74
        result = args[i].parse(t);                                                                  // 75
        if (result)                                                                                 // 76
          return result;                                                                            // 77
      }                                                                                             // 78
      return null;                                                                                  // 79
    });                                                                                             // 80
};                                                                                                  // 81
                                                                                                    // 82
// Parses a left-recursive expression with zero or more occurrences                                 // 83
// of a binary op.  Leaves the term unwrapped if no op.  For example                                // 84
// (in a hypothetical use case):                                                                    // 85
// `1` => "1"                                                                                       // 86
// `1+2` => ["binary", "1", "+", "2"]                                                               // 87
// `1+2+3` => ["binary", ["binary", "1", "+", "2"], "+", "3"]                                       // 88
//                                                                                                  // 89
// opParsers is an array of op parsers from high to low                                             // 90
// precedence (tightest-binding first)                                                              // 91
Parsers.binaryLeft = function (name, termParser, opParsers) {                                       // 92
  var opParser;                                                                                     // 93
                                                                                                    // 94
  if (opParsers.length === 1) {                                                                     // 95
    // take single opParser out of its array                                                        // 96
    opParser = opParsers[0];                                                                        // 97
  } else {                                                                                          // 98
    // pop off last opParser (non-destructively) and replace                                        // 99
    // termParser with a recursive binaryLeft on the remaining                                      // 100
    // ops.                                                                                         // 101
    termParser = Parsers.binaryLeft(name, termParser, opParsers.slice(0, -1));                      // 102
    opParser = opParsers[opParsers.length - 1];                                                     // 103
  }                                                                                                 // 104
                                                                                                    // 105
  return new Parser(                                                                                // 106
    termParser.expecting,                                                                           // 107
    function (t) {                                                                                  // 108
      var result = termParser.parse(t);                                                             // 109
      if (! result)                                                                                 // 110
        return null;                                                                                // 111
                                                                                                    // 112
      var op;                                                                                       // 113
      while ((op = opParser.parse(t))) {                                                            // 114
        result = new ParseNode(                                                                     // 115
          name,                                                                                     // 116
          [result, op, termParser.parseRequired(t)]);                                               // 117
      }                                                                                             // 118
      return result;                                                                                // 119
    });                                                                                             // 120
};                                                                                                  // 121
                                                                                                    // 122
Parsers.unary = function (name, termParser, opParser) {                                             // 123
  var unaryList = Parsers.opt(Parsers.list(opParser));                                              // 124
  return new Parser(                                                                                // 125
    termParser.expecting,                                                                           // 126
    function (t) {                                                                                  // 127
      var unaries = unaryList.parse(t);                                                             // 128
      // if we have unaries, we are committed and                                                   // 129
      // have to match a term or error.                                                             // 130
      var result = termParser.parseRequiredIf(t, unaries.length);                                   // 131
      if (! result)                                                                                 // 132
        return null;                                                                                // 133
                                                                                                    // 134
      while (unaries.length)                                                                        // 135
        result = new ParseNode(name, [unaries.pop(), result]);                                      // 136
      return result;                                                                                // 137
    });                                                                                             // 138
};                                                                                                  // 139
                                                                                                    // 140
// Parses a list of one or more items with a separator, listing the                                 // 141
// items and separators.  (Separator is optional.)  For example:                                    // 142
// `x` => ["x"]                                                                                     // 143
// `x,y` => ["x", ",", "y"]                                                                         // 144
// `x,y,z` => ["x", ",", "y", ",", "z"]                                                             // 145
// Unpacks.                                                                                         // 146
Parsers.list = function (itemParser, sepParser) {                                                   // 147
  var push = function(array, newThing) {                                                            // 148
    if (isArray(newThing))                                                                          // 149
      array.push.apply(array, newThing);                                                            // 150
    else                                                                                            // 151
      array.push(newThing);                                                                         // 152
  };                                                                                                // 153
  return new Parser(                                                                                // 154
    itemParser.expecting,                                                                           // 155
    function (t) {                                                                                  // 156
      var result = [];                                                                              // 157
      var firstItem = itemParser.parse(t);                                                          // 158
      if (! firstItem)                                                                              // 159
        return null;                                                                                // 160
      push(result, firstItem);                                                                      // 161
                                                                                                    // 162
      if (sepParser) {                                                                              // 163
        var sep;                                                                                    // 164
        while ((sep = sepParser.parse(t))) {                                                        // 165
          push(result, sep);                                                                        // 166
          push(result, itemParser.parseRequired(t));                                                // 167
        }                                                                                           // 168
      } else {                                                                                      // 169
        var item;                                                                                   // 170
        while ((item = itemParser.parse(t)))                                                        // 171
          push(result, item);                                                                       // 172
      }                                                                                             // 173
      return result;                                                                                // 174
    });                                                                                             // 175
};                                                                                                  // 176
                                                                                                    // 177
// Unpacks arrays (nested seqs).                                                                    // 178
Parsers.seq = function (/*parsers*/) {                                                              // 179
  var args = arguments;                                                                             // 180
  if (! args.length)                                                                                // 181
    return Parsers.constant([]);                                                                    // 182
                                                                                                    // 183
  return new Parser(                                                                                // 184
    args[0].expecting,                                                                              // 185
    function (t) {                                                                                  // 186
      var result = [];                                                                              // 187
      for (var i = 0, N = args.length; i < N; i++) {                                                // 188
        // first item in sequence can fail, and we                                                  // 189
        // fail (without error); after that, error on failure                                       // 190
        var r = args[i].parseRequiredIf(t, i > 0);                                                  // 191
        if (! r)                                                                                    // 192
          return null;                                                                              // 193
                                                                                                    // 194
        if (isArray(r)) // append array!                                                            // 195
          result.push.apply(result, r);                                                             // 196
        else                                                                                        // 197
          result.push(r);                                                                           // 198
      }                                                                                             // 199
      return result;                                                                                // 200
    });                                                                                             // 201
};                                                                                                  // 202
                                                                                                    // 203
// parsers except last must never consume                                                           // 204
Parsers.and = function (/*parsers*/) {                                                              // 205
  var args = arguments;                                                                             // 206
  if (! args.length)                                                                                // 207
    return Parsers.constant([]);                                                                    // 208
                                                                                                    // 209
  return new Parser(                                                                                // 210
    args[args.length - 1].expecting,                                                                // 211
    function (t) {                                                                                  // 212
      var result;                                                                                   // 213
      for(var i = 0, N = args.length; i < N; i++) {                                                 // 214
        result = args[i].parse(t);                                                                  // 215
        if (! result)                                                                               // 216
          return null;                                                                              // 217
      }                                                                                             // 218
      return result;                                                                                // 219
    });                                                                                             // 220
};                                                                                                  // 221
                                                                                                    // 222
// parser must not consume                                                                          // 223
Parsers.not = function (parser) {                                                                   // 224
  return new Parser(                                                                                // 225
    null,                                                                                           // 226
    function (t) {                                                                                  // 227
      return parser.parse(t) ? null : [];                                                           // 228
    });                                                                                             // 229
};                                                                                                  // 230
                                                                                                    // 231
// parser that looks at nothing and returns result                                                  // 232
Parsers.constant = function (result) {                                                              // 233
  return new Parser(null,                                                                           // 234
                    function (t) { return result; });                                               // 235
};                                                                                                  // 236
                                                                                                    // 237
Parsers.opt = function (parser) {                                                                   // 238
  return Parser.expecting(                                                                          // 239
    parser.expecting,                                                                               // 240
    Parsers.or(parser, Parsers.seq()));                                                             // 241
};                                                                                                  // 242
                                                                                                    // 243
Parsers.mapResult = function (parser, func) {                                                       // 244
  return new Parser(                                                                                // 245
    parser.expecting,                                                                               // 246
    function (t) {                                                                                  // 247
      var v = parser.parse(t);                                                                      // 248
      return v ? func(v, t) : null;                                                                 // 249
    });                                                                                             // 250
};                                                                                                  // 251
                                                                                                    // 252
Parsers.lazy = function (expecting, parserFunc) {                                                   // 253
  var inner = null;                                                                                 // 254
  return new Parser(expecting, function (t) {                                                       // 255
    if (! inner)                                                                                    // 256
      inner = parserFunc();                                                                         // 257
    return inner.parse(t);                                                                          // 258
  });                                                                                               // 259
};                                                                                                  // 260
                                                                                                    // 261
//////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                  //
// packages/jsparse/stringify.js                                                                    //
//                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                    //
// The "tree string" format is a simple format for representing syntax trees.                       // 1
//                                                                                                  // 2
// For example, the parse of `x++;` is written as:                                                  // 3
// "program(expressionStmnt(postfix(identifier(x) ++) ;))"                                          // 4
//                                                                                                  // 5
// A Node is written as "name(item1 item2 item3)", with additional whitespace                       // 6
// allowed anywhere between the name, parentheses, and items.                                       // 7
//                                                                                                  // 8
// Tokens don't need to be escaped unless they contain '(', ')', whitespace, or                     // 9
// backticks, or are empty.  If they do, they can be written enclosed in backticks.                 // 10
// To escape a backtick within backticks, double it.                                                // 11
//                                                                                                  // 12
// `stringify` generates "canonical" tree strings, which have no extra escaping                     // 13
// or whitespace, just one space between items in a Node.                                           // 14
                                                                                                    // 15
                                                                                                    // 16
ParseNode.prototype.stringify = function () {                                                       // 17
  return ParseNode.stringify(this);                                                                 // 18
};                                                                                                  // 19
                                                                                                    // 20
var backtickEscape = function (str) {                                                               // 21
  if (/[\s()`]/.test(str))                                                                          // 22
    return '`' + str.replace(/`/g, '``') + '`';                                                     // 23
  else if (! str)                                                                                   // 24
    return '``';                                                                                    // 25
  else                                                                                              // 26
    return str;                                                                                     // 27
};                                                                                                  // 28
                                                                                                    // 29
var backtickUnescape = function (str) {                                                             // 30
  if (str.charAt(0) === '`') {                                                                      // 31
    if (str.length === 1 || str.slice(-1) !== '`')                                                  // 32
      throw new Error("Mismatched ` in " + str);                                                    // 33
    if (str.length === 2)                                                                           // 34
      str = '';                                                                                     // 35
    else                                                                                            // 36
      str = str.slice(1, -1).replace(/``/g, '`');                                                   // 37
  }                                                                                                 // 38
  return str;                                                                                       // 39
};                                                                                                  // 40
                                                                                                    // 41
ParseNode.stringify = function (tree) {                                                             // 42
  if (tree instanceof ParseNode) {                                                                  // 43
    var str = backtickEscape(tree.name);                                                            // 44
    str += '(';                                                                                     // 45
    var escapedChildren = [];                                                                       // 46
    for(var i = 0, N = tree.children.length; i < N; i++)                                            // 47
      escapedChildren.push(ParseNode.stringify(tree.children[i]));                                  // 48
    str += escapedChildren.join(' ');                                                               // 49
    str += ')';                                                                                     // 50
    return str;                                                                                     // 51
  }                                                                                                 // 52
                                                                                                    // 53
  // Treat a token object or string as a token.                                                     // 54
  if (typeof tree.text === 'function')                                                              // 55
    tree = tree.text();                                                                             // 56
  else if (typeof tree.text === 'string')                                                           // 57
    tree = tree.text;                                                                               // 58
  return backtickEscape(String(tree));                                                              // 59
};                                                                                                  // 60
                                                                                                    // 61
ParseNode.unstringify = function (str) {                                                            // 62
  var lexemes = str.match(/\(|\)|`([^`]||``)*`|`|[^\s()`]+/g) || [];                                // 63
  var N = lexemes.length;                                                                           // 64
  var state = {                                                                                     // 65
    i: 0,                                                                                           // 66
    getParseError: function (expecting) {                                                           // 67
      throw new Error("unstringify: Expecting " + expecting +", found " +                           // 68
                      (lexemes[this.i] || "end of string"));                                        // 69
    },                                                                                              // 70
    peek: function () { return lexemes[this.i]; },                                                  // 71
    advance: function () { this.i++; }                                                              // 72
  };                                                                                                // 73
  var paren = function (chr) {                                                                      // 74
    return new Parser(chr, function (t) {                                                           // 75
      if (t.peek() !== chr)                                                                         // 76
        return null;                                                                                // 77
      t.advance();                                                                                  // 78
      return chr;                                                                                   // 79
    });                                                                                             // 80
  };                                                                                                // 81
  var EMPTY_STRING = [""];                                                                          // 82
  var token = new Parser('token', function (t) {                                                    // 83
    var txt = t.peek();                                                                             // 84
    if (!txt || txt.charAt(0) === '(' || txt.charAt(0) === ')')                                     // 85
      return null;                                                                                  // 86
                                                                                                    // 87
    t.advance();                                                                                    // 88
    // can't return falsy value from successful parser                                              // 89
    return backtickUnescape(txt) || EMPTY_STRING;                                                   // 90
  });                                                                                               // 91
                                                                                                    // 92
  // Make "item" lazy so it can be recursive.                                                       // 93
  var item = Parsers.lazy('token', function () { return item; });                                   // 94
                                                                                                    // 95
  // Parse a single node or token.                                                                  // 96
  item = Parsers.mapResult(                                                                         // 97
    Parsers.seq(token,                                                                              // 98
                Parsers.opt(Parsers.seq(                                                            // 99
                  paren('('), Parsers.opt(Parsers.list(item)), paren(')')))),                       // 100
    function (v) {                                                                                  // 101
      for(var i = 0, N = v.length; i < N; i++)                                                      // 102
        if (v[i] === EMPTY_STRING)                                                                  // 103
          v[i] = "";                                                                                // 104
                                                                                                    // 105
      if (v.length === 1)                                                                           // 106
        // token                                                                                    // 107
        return v[0];                                                                                // 108
      // node. exclude parens                                                                       // 109
      return new ParseNode(v[0], v.slice(2, -1));                                                   // 110
    });                                                                                             // 111
                                                                                                    // 112
  var endOfString = new Parser("end of string", function (t) {                                      // 113
    return t.i === N ? [] : null;                                                                   // 114
  });                                                                                               // 115
                                                                                                    // 116
  return Parsers.seq(item, endOfString).parseRequired(state)[0];                                    // 117
};                                                                                                  // 118
                                                                                                    // 119
//////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

//////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                  //
// packages/jsparse/parser.js                                                                       //
//                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                    //
///// JAVASCRIPT PARSER                                                                             // 1
                                                                                                    // 2
// What we don't support from ECMA-262 5.1:                                                         // 3
//  - object literal trailing comma                                                                 // 4
//  - object literal get/set                                                                        // 5
                                                                                                    // 6
var expecting = Parser.expecting;                                                                   // 7
                                                                                                    // 8
var assertion = Parsers.assertion;                                                                  // 9
var node = Parsers.node;                                                                            // 10
var or = Parsers.or;                                                                                // 11
var and = Parsers.and;                                                                              // 12
var not = Parsers.not;                                                                              // 13
var list = Parsers.list;                                                                            // 14
var seq = Parsers.seq;                                                                              // 15
var opt = Parsers.opt;                                                                              // 16
var constant = Parsers.constant;                                                                    // 17
var mapResult = Parsers.mapResult;                                                                  // 18
                                                                                                    // 19
                                                                                                    // 20
var makeSet = function (array) {                                                                    // 21
  var s = {};                                                                                       // 22
  for (var i = 0, N = array.length; i < N; i++)                                                     // 23
    s[array[i]] = true;                                                                             // 24
  return s;                                                                                         // 25
};                                                                                                  // 26
                                                                                                    // 27
                                                                                                    // 28
JSParser = function (code, options) {                                                               // 29
  this.lexer = new JSLexer(code);                                                                   // 30
  this.oldToken = null;                                                                             // 31
  this.newToken = null;                                                                             // 32
  this.pos = 0;                                                                                     // 33
  this.isLineTerminatorHere = false;                                                                // 34
  this.includeComments = false;                                                                     // 35
  // the last COMMENT lexeme between oldToken and newToken                                          // 36
  // that we've consumed, if any.                                                                   // 37
  this.lastCommentConsumed = null;                                                                  // 38
                                                                                                    // 39
  options = options || {};                                                                          // 40
  // pass {tokens:'strings'} to get strings for                                                     // 41
  // tokens instead of token objects                                                                // 42
  if (options.tokens === 'strings') {                                                               // 43
    this.tokenFunc = function (tok) {                                                               // 44
      return tok.text();                                                                            // 45
    };                                                                                              // 46
  } else {                                                                                          // 47
    this.tokenFunc = function (tok) {                                                               // 48
      return tok;                                                                                   // 49
    };                                                                                              // 50
  }                                                                                                 // 51
                                                                                                    // 52
  // pass {includeComments: true} to include comments in the AST.  For                              // 53
  // a comment to be included, it must occur where a series of                                      // 54
  // statements could occur, and it must be preceded by only comments                               // 55
  // and whitespace on the same line.                                                               // 56
  if (options.includeComments) {                                                                    // 57
    this.includeComments = true;                                                                    // 58
  }                                                                                                 // 59
};                                                                                                  // 60
                                                                                                    // 61
JSParser.prototype.consumeNewToken = function () {                                                  // 62
  var self = this;                                                                                  // 63
  var lexer = self.lexer;                                                                           // 64
  self.oldToken = self.newToken;                                                                    // 65
  self.isLineTerminatorHere = false;                                                                // 66
  var lex;                                                                                          // 67
  do {                                                                                              // 68
    lex = lexer.next();                                                                             // 69
    if (lex.isError())                                                                              // 70
      throw new Error("Bad token at " +                                                             // 71
                      JSLexer.prettyOffset(lexer.code, lex.startPos()) +                            // 72
                      ", text `" + lex.text() + "`");                                               // 73
    else if (lex.type() === "NEWLINE")                                                              // 74
      self.isLineTerminatorHere = true;                                                             // 75
    else if (lex.type() === "COMMENT" && ! /^.*$/.test(lex.text()))                                 // 76
      // multiline comments containing line terminators count                                       // 77
      // as line terminators.                                                                       // 78
      self.isLineTerminatorHere = true;                                                             // 79
  } while (! lex.isEOF() && ! lex.isToken());                                                       // 80
  self.newToken = lex;                                                                              // 81
  self.pos = lex.startPos();                                                                        // 82
  self.lastCommentConsumed = null;                                                                  // 83
};                                                                                                  // 84
                                                                                                    // 85
JSParser.prototype.getParseError = function (expecting, found) {                                    // 86
  var msg = (expecting ? "Expected " + expecting : "Unexpected token");                             // 87
  if (this.oldToken)                                                                                // 88
    msg += " after " + this.oldToken;                                                               // 89
  var pos = this.pos;                                                                               // 90
  msg += " at " + JSLexer.prettyOffset(this.lexer.code, pos);                                       // 91
  msg += ", found " + (found || this.newToken);                                                     // 92
  return new Error(msg);                                                                            // 93
};                                                                                                  // 94
                                                                                                    // 95
JSParser.prototype.getSyntaxTree = function () {                                                    // 96
  var self = this;                                                                                  // 97
                                                                                                    // 98
  self.consumeNewToken();                                                                           // 99
                                                                                                    // 100
  var NIL = new ParseNode('nil', []);                                                               // 101
                                                                                                    // 102
  var booleanFlaggedParser = function (parserConstructFunc) {                                       // 103
    return {                                                                                        // 104
      'false': parserConstructFunc(false),                                                          // 105
      'true': parserConstructFunc(true)                                                             // 106
    };                                                                                              // 107
  };                                                                                                // 108
                                                                                                    // 109
  // Takes a space-separated list of either punctuation or keyword tokens                           // 110
  var lookAheadToken = function (tokens) {                                                          // 111
    var type = (/\w/.test(tokens) ? 'KEYWORD' : 'PUNCTUATION');                                     // 112
    var textSet = makeSet(tokens.split(' '));                                                       // 113
    return expecting(                                                                               // 114
      tokens.split(' ').join(', '),                                                                 // 115
      assertion(function (t) {                                                                      // 116
        return (t.newToken.type() === type && textSet[t.newToken.text()]);                          // 117
      }));                                                                                          // 118
  };                                                                                                // 119
                                                                                                    // 120
  var lookAheadTokenType = function (type) {                                                        // 121
    return expecting(type, assertion(function (t) {                                                 // 122
      return t.newToken.type() === type;                                                            // 123
    }));                                                                                            // 124
  };                                                                                                // 125
                                                                                                    // 126
  // Takes a space-separated list of either punctuation or keyword tokens                           // 127
  var token = function (tokens) {                                                                   // 128
    var type = (/\w/.test(tokens) ? 'KEYWORD' : 'PUNCTUATION');                                     // 129
    var textSet = makeSet(tokens.split(' '));                                                       // 130
    return new Parser(                                                                              // 131
      tokens.split(' ').join(', '),                                                                 // 132
      function (t) {                                                                                // 133
        if (t.newToken.type() === type && textSet[t.newToken.text()]) {                             // 134
          t.consumeNewToken();                                                                      // 135
          return self.tokenFunc(t.oldToken);                                                        // 136
        }                                                                                           // 137
        return null;                                                                                // 138
      });                                                                                           // 139
  };                                                                                                // 140
                                                                                                    // 141
  var tokenType = function (type) {                                                                 // 142
    return new Parser(type, function (t) {                                                          // 143
      if (t.newToken.type() === type) {                                                             // 144
        t.consumeNewToken();                                                                        // 145
        return self.tokenFunc(t.oldToken);                                                          // 146
      }                                                                                             // 147
      return null;                                                                                  // 148
    });                                                                                             // 149
  };                                                                                                // 150
                                                                                                    // 151
  var noLineTerminatorHere = expecting(                                                             // 152
    'noLineTerminator', assertion(function (t) {                                                    // 153
      return ! t.isLineTerminatorHere;                                                              // 154
    }));                                                                                            // 155
                                                                                                    // 156
  var nonLHSExpressionNames = makeSet(                                                              // 157
    'unary binary postfix ternary assignment comma'.split(' '));                                    // 158
  var isExpressionLHS = function (exprNode) {                                                       // 159
    return ! nonLHSExpressionNames[exprNode.name];                                                  // 160
  };                                                                                                // 161
                                                                                                    // 162
  // Like token, but marks tokens that need to defy the lexer's                                     // 163
  // heuristic about whether the next '/' is a division or                                          // 164
  // starts a regex.                                                                                // 165
  var preSlashToken = function (text, divisionNotRegex) {                                           // 166
    var inner = token(text);                                                                        // 167
    return new Parser(                                                                              // 168
      inner.expecting,                                                                              // 169
      function (t) {                                                                                // 170
        // temporarily set divisionPermitted,                                                       // 171
        // restoring it if we don't match.                                                          // 172
        var oldValue = t.lexer.divisionPermitted;                                                   // 173
        var result;                                                                                 // 174
        try {                                                                                       // 175
          t.lexer.divisionPermitted = divisionNotRegex;                                             // 176
          result = inner.parse(t);                                                                  // 177
          return result;                                                                            // 178
        } finally {                                                                                 // 179
          if (! result)                                                                             // 180
            t.lexer.divisionPermitted = oldValue;                                                   // 181
        }                                                                                           // 182
      });                                                                                           // 183
  };                                                                                                // 184
                                                                                                    // 185
  // Mark some productions "lazy" to allow grammar circularity, i.e. accessing                      // 186
  // later parsers from earlier ones.                                                               // 187
  // These lazy versions will be replaced with real ones, which they will                           // 188
  // access when run.                                                                               // 189
  var expressionMaybeNoIn = {                                                                       // 190
    'false': Parsers.lazy(                                                                          // 191
      'expression',                                                                                 // 192
      function () { return expressionMaybeNoIn[false]; }),                                          // 193
    'true': Parsers.lazy(                                                                           // 194
      'expression',                                                                                 // 195
      function () { return expressionMaybeNoIn[true]; })                                            // 196
  };                                                                                                // 197
  var expression = expressionMaybeNoIn[false];                                                      // 198
                                                                                                    // 199
  var assignmentExpressionMaybeNoIn = {                                                             // 200
    'false': Parsers.lazy(                                                                          // 201
      'expression',                                                                                 // 202
      function () { return assignmentExpressionMaybeNoIn[false]; }),                                // 203
    'true': Parsers.lazy(                                                                           // 204
      'expression',                                                                                 // 205
      function () { return assignmentExpressionMaybeNoIn[true]; })                                  // 206
  };                                                                                                // 207
  var assignmentExpression = assignmentExpressionMaybeNoIn[false];                                  // 208
                                                                                                    // 209
  var functionBody = Parsers.lazy(                                                                  // 210
    'statement', function () { return functionBody; });                                             // 211
  var statement = Parsers.lazy(                                                                     // 212
    'statement', function () { return statement; });                                                // 213
  ////                                                                                              // 214
                                                                                                    // 215
  var arrayLiteral =                                                                                // 216
        node('array',                                                                               // 217
             seq(token('['),                                                                        // 218
                 opt(list(token(','))),                                                             // 219
                 or(                                                                                // 220
                   lookAheadToken(']'),                                                             // 221
                   list(                                                                            // 222
                     expecting(                                                                     // 223
                       'expression',                                                                // 224
                       or(assignmentExpression,                                                     // 225
                          // count a peeked-at ']' as an expression                                 // 226
                          // to support elisions at end, e.g.                                       // 227
                          // `[1,2,3,,,,,,]`.                                                       // 228
                          lookAheadToken(']'))),                                                    // 229
                     // list seperator is one or more commas                                        // 230
                     // to support elision                                                          // 231
                     list(token(',')))),                                                            // 232
                 token(']')));                                                                      // 233
                                                                                                    // 234
  // "IdentifierName" in ES5 allows reserved words, like in a property access                       // 235
  // or a key of an object literal.                                                                 // 236
  // Put IDENTIFIER last so it shows up in the error message.                                       // 237
  var identifierName = or(tokenType('NULL'), tokenType('BOOLEAN'),                                  // 238
                          tokenType('KEYWORD'), tokenType('IDENTIFIER'));                           // 239
                                                                                                    // 240
  var propertyName = expecting('propertyName', or(                                                  // 241
    node('idPropName', identifierName),                                                             // 242
    node('numPropName', tokenType('NUMBER')),                                                       // 243
    node('strPropName', tokenType('STRING'))));                                                     // 244
  var nameColonValue = expecting(                                                                   // 245
    'propertyName',                                                                                 // 246
    node('prop', seq(propertyName, token(':'), assignmentExpression)));                             // 247
                                                                                                    // 248
  // Allow trailing comma in object literal, per ES5.  Trailing comma                               // 249
  // must follow a `name:value`, that is, `{,}` is invalid.                                         // 250
  //                                                                                                // 251
  // We can't just use a normal comma list(), because it will seize                                 // 252
  // on the comma as a sign that the list continues.  Instead,                                      // 253
  // we specify a list of either ',' or nameColonValue, using positive                              // 254
  // and negative lookAheads to constrain the sequence.  The grammar                                // 255
  // is ordered so that error messages will always say                                              // 256
  // "Expected propertyName" or "Expected ," as appropriate, not                                    // 257
  // "Expected ," when the look-ahead is negative or "Expected }".                                  // 258
  var objectLiteral =                                                                               // 259
        node('object',                                                                              // 260
             seq(token('{'),                                                                        // 261
                 or(lookAheadToken('}'),                                                            // 262
                    and(not(lookAheadToken(',')),                                                   // 263
                        list(or(seq(token(','),                                                     // 264
                                    expecting('propertyName',                                       // 265
                                              not(lookAheadToken(',')))),                           // 266
                                seq(nameColonValue,                                                 // 267
                                    or(lookAheadToken('}'),                                         // 268
                                       lookAheadToken(','))))))),                                   // 269
                 expecting('propertyName', token('}'))));                                           // 270
                                                                                                    // 271
  var functionMaybeNameRequired = booleanFlaggedParser(                                             // 272
    function (nameRequired) {                                                                       // 273
      return seq(token('function'),                                                                 // 274
                 (nameRequired ? tokenType('IDENTIFIER') :                                          // 275
                  or(tokenType('IDENTIFIER'),                                                       // 276
                     and(lookAheadToken('('), constant(NIL)))),                                     // 277
                 token('('),                                                                        // 278
                 or(lookAheadToken(')'),                                                            // 279
                    list(tokenType('IDENTIFIER'), token(','))),                                     // 280
                 token(')'),                                                                        // 281
                 token('{'),                                                                        // 282
                 functionBody,                                                                      // 283
                 token('}'));                                                                       // 284
    });                                                                                             // 285
  var functionExpression = node('functionExpr',                                                     // 286
                                functionMaybeNameRequired[false]);                                  // 287
                                                                                                    // 288
  var primaryOrFunctionExpression =                                                                 // 289
        expecting('expression',                                                                     // 290
                  or(node('this', token('this')),                                                   // 291
                     node('identifier', tokenType('IDENTIFIER')),                                   // 292
                     node('number', tokenType('NUMBER')),                                           // 293
                     node('boolean', tokenType('BOOLEAN')),                                         // 294
                     node('null', tokenType('NULL')),                                               // 295
                     node('regex', tokenType('REGEX')),                                             // 296
                     node('string', tokenType('STRING')),                                           // 297
                     node('parens',                                                                 // 298
                          seq(token('('), expression, token(')'))),                                 // 299
                     arrayLiteral,                                                                  // 300
                     objectLiteral,                                                                 // 301
                     functionExpression));                                                          // 302
                                                                                                    // 303
                                                                                                    // 304
  var dotEnding = seq(token('.'), identifierName);                                                  // 305
  var bracketEnding = seq(token('['), expression, token(']'));                                      // 306
  var callArgs = seq(token('('),                                                                    // 307
                     or(lookAheadToken(')'),                                                        // 308
                        list(assignmentExpression,                                                  // 309
                             token(','))),                                                          // 310
                     token(')'));                                                                   // 311
                                                                                                    // 312
  var newKeyword = token('new');                                                                    // 313
                                                                                                    // 314
  // This is a completely equivalent refactor of the spec's production                              // 315
  // for a LeftHandSideExpression.                                                                  // 316
  //                                                                                                // 317
  // An lhsExpression is basically an expression that can serve as                                  // 318
  // the left-hand-side of an assignment, though function calls and                                 // 319
  // "new" invocation are included because they have the same                                       // 320
  // precedence.  Actually, the spec technically allows a function                                  // 321
  // call to "return" a valid l-value, as in `foo(bar) = baz`,                                      // 322
  // though no built-in or user-specifiable call has this property                                  // 323
  // (it would have to be defined by a browser or other "host").                                    // 324
  var lhsExpression = new Parser(                                                                   // 325
    'expression',                                                                                   // 326
    function (t) {                                                                                  // 327
      // Accumulate all initial "new" keywords, not yet knowing                                     // 328
      // if they have a corresponding argument list later.                                          // 329
      var news = [];                                                                                // 330
      var n;                                                                                        // 331
      while ((n = newKeyword.parse(t)))                                                             // 332
        news.push(n);                                                                               // 333
                                                                                                    // 334
      // Read the primaryOrFunctionExpression that will be the "core"                               // 335
      // of this lhsExpression.  It is preceded by zero or more `new`                               // 336
      // keywords, and followed by any sequence of (...), [...],                                    // 337
      // and .foo add-ons.                                                                          // 338
      // if we have 'new' keywords, we are committed and must                                       // 339
      // match an expression or error.                                                              // 340
      var result = primaryOrFunctionExpression.parseRequiredIf(t, news.length);                     // 341
      if (! result)                                                                                 // 342
        return null;                                                                                // 343
                                                                                                    // 344
      // Our plan of attack is to apply each dot, bracket, or call                                  // 345
      // as we come across it.  Whether a call is a `new` call depends                              // 346
      // on whether there are `new` keywords we haven't used.  If so,                               // 347
      // we pop one off the stack.                                                                  // 348
      var done = false;                                                                             // 349
      while (! done) {                                                                              // 350
        var r;                                                                                      // 351
        if ((r = dotEnding.parse(t))) {                                                             // 352
          result = new ParseNode('dot', [result].concat(r));                                        // 353
        } else if ((r = bracketEnding.parse(t))) {                                                  // 354
          result = new ParseNode('bracket', [result].concat(r));                                    // 355
        } else if ((r = callArgs.parse(t))) {                                                       // 356
          if (news.length)                                                                          // 357
            result = new ParseNode('newcall', [news.pop(), result].concat(r));                      // 358
          else                                                                                      // 359
            result = new ParseNode('call', [result].concat(r));                                     // 360
        } else {                                                                                    // 361
          done = true;                                                                              // 362
        }                                                                                           // 363
      }                                                                                             // 364
                                                                                                    // 365
      // There may be more `new` keywords than calls, which is how                                  // 366
      // paren-less constructions (`new Date`) are parsed.  We've                                   // 367
      // already handled `new foo().bar()`, now handle `new new foo().bar`.                         // 368
      while (news.length)                                                                           // 369
        result = new ParseNode('new', [news.pop(), result]);                                        // 370
                                                                                                    // 371
      return result;                                                                                // 372
    });                                                                                             // 373
                                                                                                    // 374
  var postfixToken = token('++ --');                                                                // 375
  var postfixLookahead = lookAheadToken('++ --');                                                   // 376
  var postfixExpression = expecting(                                                                // 377
    'expression',                                                                                   // 378
    mapResult(seq(lhsExpression,                                                                    // 379
                  opt(and(noLineTerminatorHere,                                                     // 380
                          postfixLookahead,                                                         // 381
                          postfixToken))),                                                          // 382
              function (v) {                                                                        // 383
                if (v.length === 1)                                                                 // 384
                  return v[0];                                                                      // 385
                return new ParseNode('postfix', v);                                                 // 386
              }));                                                                                  // 387
                                                                                                    // 388
  var unaryExpression = Parsers.unary(                                                              // 389
    'unary', postfixExpression,                                                                     // 390
    or(token('delete void typeof'),                                                                 // 391
       preSlashToken('++ -- + - ~ !', false)));                                                     // 392
                                                                                                    // 393
  // The "noIn" business is all to facilitate parsing                                               // 394
  // of for-in constructs, though the cases that make                                               // 395
  // this required are quite obscure.                                                               // 396
  // The `for(var x in y)` form is allowed to take                                                  // 397
  // an initializer for `x` (which is only useful for                                               // 398
  // its side effects, or if `y` has no properties).                                                // 399
  // So an example might be:                                                                        // 400
  // `for(var x = a().b in c);`                                                                     // 401
  // In this example, `var x = a().b` is parsed without                                             // 402
  // the `in`, which would otherwise be part of the                                                 // 403
  // varDecl, using varDeclNoIn.                                                                    // 404
                                                                                                    // 405
  // Our binaryExpression is the spec's LogicalORExpression,                                        // 406
  // which includes all the higher-precendence operators.                                           // 407
  var binaryExpressionMaybeNoIn = booleanFlaggedParser(                                             // 408
    function (noIn) {                                                                               // 409
      // high to low precedence                                                                     // 410
      var binaryOps = [token('* / %'),                                                              // 411
                       token('+ -'),                                                                // 412
                       token('<< >> >>>'),                                                          // 413
                       or(token('< > <= >='),                                                       // 414
                          noIn ? token('instanceof') :                                              // 415
                          token('instanceof in')),                                                  // 416
                       token('== != === !=='),                                                      // 417
                       token('&'),                                                                  // 418
                       token('^'),                                                                  // 419
                       token('|'),                                                                  // 420
                       token('&&'),                                                                 // 421
                       token('||')];                                                                // 422
      return expecting(                                                                             // 423
        'expression',                                                                               // 424
        Parsers.binaryLeft('binary', unaryExpression, binaryOps));                                  // 425
    });                                                                                             // 426
  var binaryExpression = binaryExpressionMaybeNoIn[false];                                          // 427
                                                                                                    // 428
  var conditionalExpressionMaybeNoIn = booleanFlaggedParser(                                        // 429
    function (noIn) {                                                                               // 430
      return expecting(                                                                             // 431
        'expression',                                                                               // 432
        mapResult(                                                                                  // 433
          seq(binaryExpressionMaybeNoIn[noIn],                                                      // 434
              opt(seq(                                                                              // 435
                token('?'),                                                                         // 436
                assignmentExpression, token(':'),                                                   // 437
                assignmentExpressionMaybeNoIn[noIn]))),                                             // 438
          function (v) {                                                                            // 439
            if (v.length === 1)                                                                     // 440
              return v[0];                                                                          // 441
            return new ParseNode('ternary', v);                                                     // 442
          }));                                                                                      // 443
    });                                                                                             // 444
  var conditionalExpression = conditionalExpressionMaybeNoIn[false];                                // 445
                                                                                                    // 446
  var assignOp = token('= *= /= %= += -= <<= >>= >>>= &= ^= |=');                                   // 447
                                                                                                    // 448
  assignmentExpressionMaybeNoIn = booleanFlaggedParser(                                             // 449
    function (noIn) {                                                                               // 450
      return new Parser(                                                                            // 451
        'expression',                                                                               // 452
        function (t) {                                                                              // 453
          var r = conditionalExpressionMaybeNoIn[noIn].parse(t);                                    // 454
          if (! r)                                                                                  // 455
            return null;                                                                            // 456
                                                                                                    // 457
          // Assignment is right-associative.                                                       // 458
          // Plan of attack: make a list of all the parts                                           // 459
          // [expression, op, expression, op, ... expression]                                       // 460
          // and then fold them up at the end.                                                      // 461
          var parts = [r];                                                                          // 462
          var op;                                                                                   // 463
          while (isExpressionLHS(r) &&(op = assignOp.parse(t)))                                     // 464
            parts.push(op,                                                                          // 465
                       conditionalExpressionMaybeNoIn[noIn].parseRequired(t));                      // 466
                                                                                                    // 467
          var result = parts.pop();                                                                 // 468
          while (parts.length) {                                                                    // 469
            op = parts.pop();                                                                       // 470
            var lhs = parts.pop();                                                                  // 471
            result = new ParseNode('assignment', [lhs, op, result]);                                // 472
          }                                                                                         // 473
          return result;                                                                            // 474
        });                                                                                         // 475
    });                                                                                             // 476
  assignmentExpression = assignmentExpressionMaybeNoIn[false];                                      // 477
                                                                                                    // 478
  expressionMaybeNoIn = booleanFlaggedParser(                                                       // 479
    function (noIn) {                                                                               // 480
      return expecting(                                                                             // 481
        'expression',                                                                               // 482
        mapResult(                                                                                  // 483
          list(assignmentExpressionMaybeNoIn[noIn], token(',')),                                    // 484
          function (v) {                                                                            // 485
            if (v.length === 1)                                                                     // 486
              return v[0];                                                                          // 487
            return new ParseNode('comma', v);                                                       // 488
          }));                                                                                      // 489
    });                                                                                             // 490
  expression = expressionMaybeNoIn[false];                                                          // 491
                                                                                                    // 492
  // STATEMENTS                                                                                     // 493
                                                                                                    // 494
  var comment = node('comment', new Parser(null, function (t) {                                     // 495
    if (! t.includeComments)                                                                        // 496
      return null;                                                                                  // 497
                                                                                                    // 498
    // Match a COMMENT lexeme between oldToken and newToken.                                        // 499
    //                                                                                              // 500
    // This is an unusual Parser because it doesn't match and consume                               // 501
    // newToken, but instead uses the next()/prev() API on lexemes.                                 // 502
    // It assumes it can walk the linked list backwards from newToken                               // 503
    // (though not necessarily forwards).                                                           // 504
    //                                                                                              // 505
    // We start at the last comment we've visited for this                                          // 506
    // oldToken/newToken pair, if any, or else oldToken, or else the                                // 507
    // beginning of the token stream.  We ignore comments that are                                  // 508
    // preceded by any non-comment source code on the same line.                                    // 509
    var lexeme = (t.lastCommentConsumed || t.oldToken || null);                                     // 510
    if (! lexeme) {                                                                                 // 511
      // no oldToken, must be on first token.  walk backwards                                       // 512
      // to start with first lexeme (which may be a comment                                         // 513
      // or whitespace)                                                                             // 514
      lexeme = t.newToken;                                                                          // 515
      while (lexeme.prev())                                                                         // 516
        lexeme = lexeme.prev();                                                                     // 517
    } else {                                                                                        // 518
      // start with lexeme after last token or comment consumed                                     // 519
      lexeme = lexeme.next();                                                                       // 520
    }                                                                                               // 521
    var seenNewline = ((! t.oldToken) || t.lastCommentConsumed || false);                           // 522
    while (lexeme !== t.newToken) {                                                                 // 523
      var type = lexeme.type();                                                                     // 524
      if (type === "NEWLINE") {                                                                     // 525
        seenNewline = true;                                                                         // 526
      } else if (type === "COMMENT") {                                                              // 527
        t.lastCommentConsumed = lexeme;                                                             // 528
        if (seenNewline)                                                                            // 529
          return lexeme;                                                                            // 530
      }                                                                                             // 531
      lexeme = lexeme.next();                                                                       // 532
    }                                                                                               // 533
    return null;                                                                                    // 534
  }));                                                                                              // 535
                                                                                                    // 536
  var statements = list(or(comment, statement));                                                    // 537
                                                                                                    // 538
  // implements JavaScript's semicolon "insertion" rules                                            // 539
  var maybeSemicolon = expecting(                                                                   // 540
    'semicolon',                                                                                    // 541
    or(token(';'),                                                                                  // 542
       and(                                                                                         // 543
         or(                                                                                        // 544
           lookAheadToken('}'),                                                                     // 545
           lookAheadTokenType('EOF'),                                                               // 546
           assertion(function (t) {                                                                 // 547
             return t.isLineTerminatorHere;                                                         // 548
           })),                                                                                     // 549
         constant(new ParseNode(';', [])))));                                                       // 550
                                                                                                    // 551
  var expressionStatement = node(                                                                   // 552
    'expressionStmnt',                                                                              // 553
    and(                                                                                            // 554
      not(or(lookAheadToken('{'), lookAheadToken('function'))),                                     // 555
      seq(expression,                                                                               // 556
          expecting('semicolon',                                                                    // 557
                    or(maybeSemicolon,                                                              // 558
                       // allow presence of colon to terminate                                      // 559
                       // statement legally, for the benefit of                                     // 560
                       // expressionOrLabelStatement.  Basically assume                             // 561
                       // an implicit semicolon.  This                                              // 562
                       // is safe because a colon can never legally                                 // 563
                       // follow a semicolon anyway.                                                // 564
                       and(lookAheadToken(':'),                                                     // 565
                           constant(new ParseNode(';', []))))))));                                  // 566
                                                                                                    // 567
  // it's hard to parse statement labels, as in                                                     // 568
  // `foo: x = 1`, because we can't tell from the                                                   // 569
  // first token whether we are looking at an expression                                            // 570
  // statement or a label statement.  To work around this,                                          // 571
  // expressionOrLabelStatement parses the expression and                                           // 572
  // then rewrites the result if it is an identifier                                                // 573
  // followed by a colon.                                                                           // 574
  var labelColonAndStatement = seq(token(':'), statement);                                          // 575
  var noColon = expecting(                                                                          // 576
    'semicolon', not(lookAheadToken(':')));                                                         // 577
  var expressionOrLabelStatement = new Parser(                                                      // 578
    null,                                                                                           // 579
    function (t) {                                                                                  // 580
      var exprStmnt = expressionStatement.parse(t);                                                 // 581
      if (! exprStmnt)                                                                              // 582
        return null;                                                                                // 583
                                                                                                    // 584
      var expr = exprStmnt.children[0];                                                             // 585
      var maybeSemi = exprStmnt.children[1];                                                        // 586
      if (expr.name !== 'identifier' ||                                                             // 587
          ! (maybeSemi instanceof ParseNode)) {                                                     // 588
        // We either have a non-identifier expression or a present                                  // 589
        // semicolon.  This is not a label.                                                         // 590
        //                                                                                          // 591
        // Fail now if we are looking at a colon, causing an                                        // 592
        // error message on input like `1+1:` of the same kind                                      // 593
        // you'd get without statement label parsing.                                               // 594
        noColon.parseRequired(t);                                                                   // 595
        return exprStmnt;                                                                           // 596
      }                                                                                             // 597
                                                                                                    // 598
      var rest = labelColonAndStatement.parse(t);                                                   // 599
      if (! rest)                                                                                   // 600
        return exprStmnt;                                                                           // 601
                                                                                                    // 602
      return new ParseNode('labelStmnt',                                                            // 603
                           [expr.children[0]].concat(rest));                                        // 604
    });                                                                                             // 605
                                                                                                    // 606
  var emptyStatement = node('emptyStmnt', token(';')); // required semicolon                        // 607
                                                                                                    // 608
  var blockStatement = expecting('block', node('blockStmnt', seq(                                   // 609
    token('{'), or(lookAheadToken('}'), statements),                                                // 610
    token('}'))));                                                                                  // 611
                                                                                                    // 612
  var varDeclMaybeNoIn = booleanFlaggedParser(function (noIn) {                                     // 613
    return node(                                                                                    // 614
      'varDecl',                                                                                    // 615
      seq(tokenType('IDENTIFIER'),                                                                  // 616
          opt(seq(token('='),                                                                       // 617
                  assignmentExpressionMaybeNoIn[noIn]))));                                          // 618
  });                                                                                               // 619
  var varDecl = varDeclMaybeNoIn[false];                                                            // 620
                                                                                                    // 621
  var variableStatement = node(                                                                     // 622
    'varStmnt',                                                                                     // 623
    seq(token('var'), list(varDecl, token(',')),                                                    // 624
        maybeSemicolon));                                                                           // 625
                                                                                                    // 626
  // A paren that may be followed by a statement                                                    // 627
  // beginning with a regex literal.                                                                // 628
  var closeParenBeforeStatement = preSlashToken(')', false);                                        // 629
                                                                                                    // 630
  var ifStatement = node(                                                                           // 631
    'ifStmnt',                                                                                      // 632
    seq(token('if'), token('('), expression,                                                        // 633
        closeParenBeforeStatement, statement,                                                       // 634
        opt(seq(token('else'), statement))));                                                       // 635
                                                                                                    // 636
  var secondThirdClauses = expecting(                                                               // 637
    'semicolon',                                                                                    // 638
    and(lookAheadToken(';'),                                                                        // 639
        seq(                                                                                        // 640
          expecting('semicolon', token(';')),                                                       // 641
          or(and(lookAheadToken(';'),                                                               // 642
                 constant(NIL)),                                                                    // 643
             expression),                                                                           // 644
          expecting('semicolon', token(';')),                                                       // 645
          or(and(lookAheadToken(')'),                                                               // 646
                 constant(NIL)),                                                                    // 647
             expression))));                                                                        // 648
  var inExpr = seq(token('in'), expression);                                                        // 649
  var inExprExpectingSemi = expecting('semicolon',                                                  // 650
                                      seq(token('in'), expression));                                // 651
  var forSpec = mapResult(node(                                                                     // 652
    'forSpec',                                                                                      // 653
    or(seq(token('var'),                                                                            // 654
           varDeclMaybeNoIn[true],                                                                  // 655
           expecting(                                                                               // 656
             'commaOrIn',                                                                           // 657
             or(inExpr,                                                                             // 658
                seq(                                                                                // 659
                  or(                                                                               // 660
                    lookAheadToken(';'),                                                            // 661
                    seq(token(','),                                                                 // 662
                        list(varDeclMaybeNoIn[true], token(',')))),                                 // 663
                  secondThirdClauses)))),                                                           // 664
       // get the case where the first clause is empty out of the way.                              // 665
       // the lookAhead's return value is the empty placeholder for the                             // 666
       // missing expression.                                                                       // 667
       seq(and(lookAheadToken(';'),                                                                 // 668
               constant(NIL)), secondThirdClauses),                                                 // 669
       // custom parser the non-var case because we have to                                         // 670
       // read the first expression before we know if there's                                       // 671
       // an "in".                                                                                  // 672
       new Parser(                                                                                  // 673
         null,                                                                                      // 674
         function (t) {                                                                             // 675
           var firstExpr = expressionMaybeNoIn[true].parse(t);                                      // 676
           if (! firstExpr)                                                                         // 677
             return null;                                                                           // 678
           var rest = secondThirdClauses.parse(t);                                                  // 679
           if (! rest) {                                                                            // 680
             // we need a left-hand-side expression for a                                           // 681
             // `for (x in y)` loop.                                                                // 682
             if (! isExpressionLHS(firstExpr))                                                      // 683
               throw t.getParseError("semicolon");                                                  // 684
             // if we don't see 'in' at this point, it's probably                                   // 685
             // a missing semicolon                                                                 // 686
             rest = inExprExpectingSemi.parseRequired(t);                                           // 687
           }                                                                                        // 688
                                                                                                    // 689
           return [firstExpr].concat(rest);                                                         // 690
         }))),                                                                                      // 691
                          function (clauses) {                                                      // 692
                            // There are four kinds of for-loop, and we call the                    // 693
                            // part between the parens one of forSpec, forVarSpec,                  // 694
                            // forInSpec, and forVarInSpec.  Having parsed it                       // 695
                            // already, we rewrite the node name based on how                       // 696
                            // many items came out.  forIn and forVarIn always                      // 697
                            // have 3 and 4 items respectively.  for has 5                          // 698
                            // (the optional expressions are present as nils).                      // 699
                            // forVar has 6 or more, because `for(var x;;);`                        // 700
                            // produces [`var` `x` `;` nil `;` nil].                                // 701
                            var numChildren = clauses.children.length;                              // 702
                            if (numChildren === 3)                                                  // 703
                              return new ParseNode('forInSpec', clauses.children);                  // 704
                            else if (numChildren === 4)                                             // 705
                              return new ParseNode('forVarInSpec', clauses.children);               // 706
                            else if (numChildren >= 6)                                              // 707
                              return new ParseNode('forVarSpec', clauses.children);                 // 708
                            return clauses;                                                         // 709
                          });                                                                       // 710
                                                                                                    // 711
  var iterationStatement = or(                                                                      // 712
    node('doStmnt', seq(token('do'), statement, token('while'),                                     // 713
                        token('('), expression, token(')'),                                         // 714
                        maybeSemicolon)),                                                           // 715
    node('whileStmnt', seq(token('while'), token('('), expression,                                  // 716
                           closeParenBeforeStatement, statement)),                                  // 717
    // semicolons must be real, not maybeSemicolons                                                 // 718
    node('forStmnt', seq(                                                                           // 719
      token('for'), token('('), forSpec, closeParenBeforeStatement,                                 // 720
      statement)));                                                                                 // 721
                                                                                                    // 722
  var returnStatement = node(                                                                       // 723
    'returnStmnt',                                                                                  // 724
    seq(token('return'), or(                                                                        // 725
      and(noLineTerminatorHere, expression), constant(NIL)),                                        // 726
        maybeSemicolon));                                                                           // 727
  var continueStatement = node(                                                                     // 728
    'continueStmnt',                                                                                // 729
    seq(token('continue'), or(                                                                      // 730
      and(noLineTerminatorHere, tokenType('IDENTIFIER')), constant(NIL)),                           // 731
        maybeSemicolon));                                                                           // 732
  var breakStatement = node(                                                                        // 733
    'breakStmnt',                                                                                   // 734
    seq(token('break'), or(                                                                         // 735
      and(noLineTerminatorHere, tokenType('IDENTIFIER')), constant(NIL)),                           // 736
        maybeSemicolon));                                                                           // 737
  var throwStatement = node(                                                                        // 738
    'throwStmnt',                                                                                   // 739
    seq(token('throw'),                                                                             // 740
        and(or(noLineTerminatorHere,                                                                // 741
               // If there is a line break here and more tokens after,                              // 742
               // we want to error appropriately.  `throw \n e` should                              // 743
               // complain about the "end of line", not the `e`.                                    // 744
               and(not(lookAheadTokenType("EOF")),                                                  // 745
                   new Parser(null,                                                                 // 746
                              function (t) {                                                        // 747
                                throw t.getParseError('expression', 'end of line');                 // 748
                              }))),                                                                 // 749
            expression),                                                                            // 750
        maybeSemicolon));                                                                           // 751
                                                                                                    // 752
  var withStatement = node(                                                                         // 753
    'withStmnt',                                                                                    // 754
    seq(token('with'), token('('), expression, closeParenBeforeStatement,                           // 755
        statement));                                                                                // 756
                                                                                                    // 757
  var switchCase = node(                                                                            // 758
    'case',                                                                                         // 759
    seq(token('case'), expression, token(':'),                                                      // 760
        or(lookAheadToken('}'),                                                                     // 761
           lookAheadToken('case default'),                                                          // 762
           statements)));                                                                           // 763
  var switchDefault = node(                                                                         // 764
    'default',                                                                                      // 765
    seq(token('default'), token(':'),                                                               // 766
        or(lookAheadToken('}'),                                                                     // 767
           lookAheadToken('case'),                                                                  // 768
           statements)));                                                                           // 769
                                                                                                    // 770
  var switchStatement = node(                                                                       // 771
    'switchStmnt',                                                                                  // 772
    seq(token('switch'), token('('), expression, token(')'),                                        // 773
        token('{'),                                                                                 // 774
        or(lookAheadToken('}'),                                                                     // 775
           lookAheadToken('default'),                                                               // 776
           list(switchCase)),                                                                       // 777
        opt(seq(switchDefault,                                                                      // 778
                opt(list(switchCase)))),                                                            // 779
        token('}')));                                                                               // 780
                                                                                                    // 781
  var catchFinally = expecting(                                                                     // 782
    'catch',                                                                                        // 783
    and(lookAheadToken('catch finally'),                                                            // 784
        seq(                                                                                        // 785
          or(node(                                                                                  // 786
            'catch',                                                                                // 787
            seq(token('catch'), token('('), tokenType('IDENTIFIER'),                                // 788
                token(')'), blockStatement)),                                                       // 789
             constant(NIL)),                                                                        // 790
          or(node(                                                                                  // 791
            'finally',                                                                              // 792
            seq(token('finally'), blockStatement)),                                                 // 793
             constant(NIL)))));                                                                     // 794
  var tryStatement = node(                                                                          // 795
    'tryStmnt',                                                                                     // 796
    seq(token('try'), blockStatement, catchFinally));                                               // 797
  var debuggerStatement = node(                                                                     // 798
    'debuggerStmnt', seq(token('debugger'), maybeSemicolon));                                       // 799
                                                                                                    // 800
  statement = expecting('statement',                                                                // 801
                        or(expressionOrLabelStatement,                                              // 802
                           emptyStatement,                                                          // 803
                           blockStatement,                                                          // 804
                           variableStatement,                                                       // 805
                           ifStatement,                                                             // 806
                           iterationStatement,                                                      // 807
                           returnStatement,                                                         // 808
                           continueStatement,                                                       // 809
                           breakStatement,                                                          // 810
                           withStatement,                                                           // 811
                           switchStatement,                                                         // 812
                           throwStatement,                                                          // 813
                           tryStatement,                                                            // 814
                           debuggerStatement));                                                     // 815
                                                                                                    // 816
  // PROGRAM                                                                                        // 817
                                                                                                    // 818
  var functionDecl = node(                                                                          // 819
    'functionDecl', functionMaybeNameRequired[true]);                                               // 820
                                                                                                    // 821
  // Look for statement before functionDecl, to catch comments in                                   // 822
  // includeComments mode.  A statement can't start with 'function'                                 // 823
  // anyway, so the order doesn't matter otherwise.                                                 // 824
  var sourceElement = or(statement, functionDecl);                                                  // 825
  var sourceElements = list(or(comment, sourceElement));                                            // 826
                                                                                                    // 827
  functionBody = expecting(                                                                         // 828
    'functionBody', or(lookAheadToken('}'), sourceElements));                                       // 829
                                                                                                    // 830
  var program = node(                                                                               // 831
    'program',                                                                                      // 832
    seq(opt(sourceElements),                                                                        // 833
        // If not at EOF, complain "expecting statement"                                            // 834
        expecting('statement', lookAheadTokenType("EOF"))));                                        // 835
                                                                                                    // 836
  return program.parse(this);                                                                       // 837
};                                                                                                  // 838
                                                                                                    // 839
//////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);

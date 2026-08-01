import { IsString, MaxLength } from 'class-validator'

export class SaveNoteDto {
  @IsString()
  @MaxLength(2000)
  text!: string
}

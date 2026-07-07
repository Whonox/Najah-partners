import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MemberLoginDto {
  @ApiProperty({
    description: 'E-mail, téléphone ou code membre (NP…)',
    example: 'NP001024',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier!: string;

  @ApiProperty({ description: 'Mot de passe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password!: string;
}

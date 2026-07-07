import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'E-mail, téléphone ou code membre du compte à récupérer',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier!: string;
}

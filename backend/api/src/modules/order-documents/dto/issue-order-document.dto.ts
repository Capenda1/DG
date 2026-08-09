import { IsEnum } from 'class-validator';
import {
  InvoiceDocumentModel,
  OrderDocumentIssueAction,
} from '@prisma/client';

export class IssueOrderDocumentDto {
  @IsEnum(InvoiceDocumentModel)
  documentModel!: InvoiceDocumentModel;

  @IsEnum(OrderDocumentIssueAction)
  action!: OrderDocumentIssueAction;
}

import { document } from "@libs/dynamodbClient";
import { APIGatewayProxyHandler } from "aws-lambda";

interface IUserCertificate {
  id: string;
  name: string;
  created_at: number;
  grade: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const { id } = event.pathParameters;

  const response = await document.query({
    TableName: 'users_certificate',
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: { ':id': id }
  }).promise();

  const userCertificate = response.Items[0] as IUserCertificate;

  if (!userCertificate) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Certificado não encontrado!'
      })
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Certificado já existe!',
      name: userCertificate.name,
      url: `${userCertificate.id}.pdf`,
    })
  }
}
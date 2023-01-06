import { document } from "@libs/dynamodbClient";
import { APIGatewayProxyHandler } from "aws-lambda";
import { compile } from 'handlebars';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';
import chromium from 'chrome-aws-lambda';
import { Browser } from "puppeteer-core";
import { S3 } from "aws-sdk";

interface ICreateCertificate {
  id: string;
  name: string;
  grade: string;
}

interface ITemplate extends ICreateCertificate {
  medal: string;
  date: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;

  const isOffline = process.env.IS_OFFLINE;
  
  const response = await document.query({
    TableName: 'users_certificate',
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: { ':id': id }
  }).promise();

  const userAlreadyExists = response.Items[0];

  if (!userAlreadyExists) {
    await document.put({
      TableName: 'users_certificate',
      Item: { id, name, grade, created_at: new Date().getTime() }
    }).promise();
  }

  const medalPath = path.join(process.cwd(), 'src', 'templates', 'selo.png');
  const medal = fs.readFileSync(medalPath, 'base64');

  const data: ITemplate = {
    id,
    grade,
    name,
    date: dayjs().format('DD/MM/YYYY'),
    medal,
  }

  const content = await compileTemplate(data);
  let browser: Browser;
  let pdf: Buffer;

  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      userDataDir: '/dev/null'
    });
  
    const page = await browser.newPage();
    await page.setContent(content);
    pdf = await page.pdf({
      format: 'a4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      path: isOffline ? './certificate.pdf' : null,
    });
    
    await browser.close();
  } catch (error) {
    if (browser) await browser.close();

    return {
      statusCode: 400,
      body: JSON.stringify({error})
    }
  }

  if (!isOffline) {
    const s3 = new S3();

    await s3.putObject({
      Bucket: 'testing_serverless',
      Key: `${id}.pdf`,
      ACL: 'public-read',
      Body: pdf,
      ContentType: 'application/pdf'
    }).promise();
  }

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Certificado gerado com sucesso!',
      url: `${id}.pdf`,
    })
  }
}

async function compileTemplate(data: ITemplate) {
  const filePath = path.join(process.cwd(), 'src', 'templates', 'certificate.hbs');
  const file = fs.readFileSync(filePath, 'utf8');
  return compile(file)(data);
}
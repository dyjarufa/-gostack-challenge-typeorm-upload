import csvParse from 'csv-parse';

import { getCustomRepository, getRepository, In } from 'typeorm';

import fs from 'fs';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVtransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionsRepository);
    const categoryRepository = getRepository(Category);

    const contactReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      // delimiter: ','
      from_line: 2,
    });

    // read each line
    const parseCSV = contactReadStream.pipe(parsers);

    const transactions: CSVtransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);

      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const existentCategories = await categoryRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    const addCategoriesTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category)) // add category does not exists
      .filter((value, index, self) => self.indexOf(value) === index); // remove duplicate

    // console.log(addCategoriesTitles);
    // console.log(existentCategoriesTitles);
    // console.log(transactions);

    const newCategories = categoryRepository.create(
      addCategoriesTitles.map(title => ({
        title,
      })),
    );

    categoryRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    const createdTransactions = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;

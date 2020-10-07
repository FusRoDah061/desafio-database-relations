import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found.');
    }

    const productsIds = products.map(product => {
      return { id: product.id };
    });

    const stockProducts = await this.productsRepository.findAllById(
      productsIds,
    );

    if (stockProducts.length !== products.length) {
      throw new AppError('One or more products does not exist.');
    }

    let areAllProductsAvailable = true;

    const orderProducts = stockProducts.map(product => {
      const orderProduct = products.find(p => p.id === product.id);

      if (orderProduct && orderProduct.quantity > product.quantity) {
        areAllProductsAvailable = false;
      }

      return {
        product_id: product.id,
        price: product.price,
        quantity: orderProduct?.quantity || 0,
      };
    });

    if (!areAllProductsAvailable) {
      throw new AppError(
        'One or more products are not available in the request quantity.',
      );
    }

    await this.productsRepository.updateQuantity(
      stockProducts.map(product => {
        const orderProduct = products.find(p => p.id === product.id);

        if (orderProduct) {
          return {
            id: product.id,
            quantity: product.quantity - orderProduct.quantity,
          };
        }

        return {
          id: product.id,
          quantity: product.quantity,
        };
      }),
    );

    const order = await this.ordersRepository.create({
      customer,
      products: orderProducts,
    });

    return order;
  }
}

export default CreateOrderService;

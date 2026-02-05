module Api
  class PurchaseOrdersController < ApplicationController
    before_action :set_purchase_order, only: [:show, :update, :destroy, :submit]

    def index
      @purchase_orders = current_organization.purchase_orders
        .where(requester: current_user)
        .order(created_at: :desc)
      render json: @purchase_orders
    end

    def show
      render json: @purchase_order
    end

    def create
      @purchase_order = current_organization.purchase_orders.new(purchase_order_params)
      @purchase_order.requester = current_user

      if @purchase_order.save
        render json: @purchase_order, status: :created
      else
        render json: { errors: @purchase_order.errors }, status: :unprocessable_entity
      end
    end

    def submit
      @purchase_order.submit_for_approval
      render json: @purchase_order
    end

    private

    def set_purchase_order
      @purchase_order = current_organization.purchase_orders.find(params[:id])
    end

    def purchase_order_params
      params.require(:purchase_order).permit(:title, :description, :amount)
    end
  end
end

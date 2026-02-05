module Api
  class ExpenseReportsController < ApplicationController
    before_action :set_expense_report, only: [:show, :update, :destroy, :submit]

    def index
      @expense_reports = current_organization.expense_reports
        .where(submitter: current_user)
        .order(created_at: :desc)
      render json: @expense_reports
    end

    def show
      render json: @expense_report
    end

    def create
      @expense_report = current_organization.expense_reports.new(expense_report_params)
      @expense_report.submitter = current_user

      if @expense_report.save
        render json: @expense_report, status: :created
      else
        render json: { errors: @expense_report.errors }, status: :unprocessable_entity
      end
    end

    def submit
      @expense_report.submit_for_approval
      render json: @expense_report
    end

    private

    def set_expense_report
      @expense_report = current_organization.expense_reports.find(params[:id])
    end

    def expense_report_params
      params.require(:expense_report).permit(:title, :description, :amount, :category)
    end
  end
end

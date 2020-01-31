# frozen_string_literal: true

class Candidate::PortfoliosController < Candidate::BaseController
  respond_to :html, :json, :js
  before_action :find_portfolio, only: [:update]
  def create
    @portfolio = current_candidate.portfolios.new(portfolio_params)
    if @portfolio.save
      flash[:success] = 'Portfolio created Successfully'
    else
      flash[:errors] = @portfolio.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def update
    if @portfolio.update_attributes(education_params)
      flash[:success] = 'Education Changed.'
    else
      flash[:errors] = @portfolio.errors.full_messages
    end
    respond_with @portfolio
  end

  private

  def find_portfolio
    @portfolio = current_candidate.portfolios.find(param[:id])
  end

  def portfolio_params
    params.require(:portfolio).permit(:cover_photo, :name, :description)
  end
end

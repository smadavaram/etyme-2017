class Company::InvoicesController < Company::BaseController

  before_action :find_contract , only: [:show, :download , :index,:accept_invoice,:reject_invoice ]
  before_action :find_invoice , only: [:show, :download,:accept_invoice,:reject_invoice]
  before_action :set_invoices , only: [:index,:accept_invoice,:reject_invoice]

  add_breadcrumb "INVOICES", '#', options: { title: "INVOICES" }

  def index
  end

  def accept_invoice
    if current_user.is_admin?
        @invoice.submitted!
        @invoice.submitted_by = current_user
        @invoice.submitted_on = DateTime.now
      if @invoice.save
      flash[:success] = "Successfully Submitted"
    else
      flash[:errors] = @invoice.errors.full_messages
      end
    end
    redirect_to :back
  end

  def reject_invoice
    if current_user.is_admin?
      @invoice.cancelled!
      @invoice.submitted_by = current_user
      @invoice.submitted_on = DateTime.now
      if @invoice.save
        flash[:success] = "Successfully Cancelled"
      else
        flash[:errors] = @invoice.errors.full_messages
      end
    end
    redirect_to :back
  end

  def show
    respond_to do |format|
      format.html
      format.pdf do
            render pdf: @contract.title,
           file: Rails.root.join('app/views/company/invoices/show.html.haml'),
           orientation: 'Landscape', encoding: 'UTF-8',
           disposition: 'attachment',
           layout: 'company',
           title: @contract.title
      end
    end
  end

  def download
    html = render_to_string( :layout => false)
    pdf = WickedPdf.new.pdf_from_string(html)
    send_data(pdf, :filename    => "#{@contract.title}.pdf", :type => "application/pdf", :disposition => 'attachment')
  end

  private

  def find_contract
    # @contract = current_company.sent_contracts.find(params[:contract_id])
    @contract = Contract.find_sent_or_received(params[:contract_id] , current_company).first || []
  end

  def find_invoice
    @invoice  = @contract.invoices.includes(timesheets: [timesheet_logs: [:transactions , :contract_term]]).find(params[:id])
    # if  !@contract.is_sent?(current_company)
    #
    # elsif  not @invoice.submitted? && @contract.is_sent?(current_company)
    #   redirect_to contract_path(@contract)
    # end
  end

  def set_invoices
    @invoices  = @contract.invoices || []
  end

end

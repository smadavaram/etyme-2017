class Company::InvoicesController < Company::BaseController

  before_action :find_contract , only: [:show, :download , :index,:accept_invoice,:reject_invoice ]
  before_action :find_invoice , only: [:show, :download,:accept_invoice,:reject_invoice]
  before_action :set_invoices , only: [:accept_invoice,:reject_invoice]
  before_action :set_company_contract_invoices , only: [:index]

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
      flash[:errors] = "You are Not authorized to Submitt this Invoice. "
      end
    end
    redirect_to :back
  end

  def reject_invoice
    if @contract.assignee == current_user
      @invoice.cancelled!
      @invoice.submitted_by = current_user
      @invoice.submitted_on = DateTime.now
      if @invoice.save
        flash[:success] = "Successfully Cancelled"
      else
        flash[:errors] = "You are Not authorized to Cancel this Invoice. "
      end
    end
    redirect_to :back
  end

  def show
    @timesheet_logs = find_child_invoice_timesheet_logs(@invoice)
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
    if  !@contract.is_sent?(current_company)

    elsif  not (@invoice.submitted? && @contract.is_sent?(current_company))
      flash[:errors] = "Invoice is not submitted by Responde"
      redirect_to contract_invoices_path(@contract)
    end
  end

  def set_invoices
    @invoices  =  @contract.invoices || []
  end

  def set_company_contract_invoices
    if params['contract_id'].present?
     @invoices  =  @contract.invoices || []
    end
    @send_contract_invoices = current_company.sent_invoices
    @rec_contract_invoices = current_company.received_invoices
  end

  def find_child_invoice_timesheet_logs invoice
    return invoice.parent_invoice.present? ?  find_child_invoice_timesheet_logs(invoice.parent_invoice) : invoice.timesheet_logs
  end

end

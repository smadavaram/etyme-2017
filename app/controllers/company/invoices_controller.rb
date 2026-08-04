# frozen_string_literal: true

class Company::InvoicesController < Company::BaseController
  before_action :find_contract, only: %i[show download index accept_invoice reject_invoice paid_invoice]
  before_action :find_invoice, only: %i[show download accept_invoice reject_invoice paid_invoice]
  before_action :set_invoices, only: [:reject_invoice]
  # before_action :set_company_contract_invoices, only: [:index]
  before_action :authorized_user, only: %i[index reject_invoice show]

  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'Invoices', invoices_path
    @tab = params[:tab] || 'purchase'
    @receive_invoices = current_company.receive_invoices.where(status: %i[submitted paid partially_paid cancelled]).joins(:contract).paginate(page: params[:page], per_page: 15)
    @sent_invoices = current_company.sent_invoices.where(status: %i[open submitted paid partially_paid cancelled]).joins(:contract).paginate(page: params[:page], per_page: 15)
  end

  def sale
    @tab = params[:tab] || 'all_invoices'
    @start_date = params[:start_date]
    @end_date = params[:end_date]

    add_breadcrumb @tab.eql?('all_invoices') ? @tab : "#{@tab} Invoice(s)", '#', options: { title: 'INVOICES' }
    @sent_invoices = if @start_date.present? && @end_date.present?
                       current_company.sent_invoices.send(@tab.to_s).where('invoices.start_date > ? AND invoices.end_date < ?', @start_date, @end_date).joins(:contract).paginate(page: params[:page], per_page: 15)
                     else
                       current_company.sent_invoices.send(@tab.to_s).joins(:contract).paginate(page: params[:page], per_page: 15)
                     end
  end

  def purchase
    @tab = params[:tab] || 'all_invoices'
    @start_date = params[:start_date]
    @end_date = params[:end_date]
    add_breadcrumb @tab.eql?('all_invoices') ? @tab : "#{@tab} Invoice(s)", '#'
    @receive_invoices = if @start_date.present? && @end_date.present?
                          current_company.receive_invoices.send(@tab.to_s).where('invoices.start_date > ? AND invoices.end_date < ?', @start_date, @end_date).joins(:contract).paginate(page: params[:page], per_page: 15)

                        else
                          current_company.receive_invoices.send(@tab.to_s).joins(:contract).paginate(page: params[:page], per_page: 15)

                        end
  end

  def cleared_invoice
    @invoices = Invoice.cleared_invoices.joins(:contract).where(contracts: { company_id: current_company.id }).order('created_at DESC')
    render 'index'
  end

  def client_submit_invoice
    service = InvoiceWorkflowService.new(current_user, current_company)
    result = service.client_submit_invoice(params[:ids])
    flash[:errors] = result[:errors] unless result[:success]
    redirect_back(fallback_location: root_path)
  end

  def submit_invoice
    service = InvoiceWorkflowService.new(current_user, current_company)
    result = service.submit_invoice(params[:id])
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back fallback_location: invoices_path
  end

  def accept_invoice
    service = InvoiceWorkflowService.new(current_user, current_company)
    result = service.accept_invoice(@invoice)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back fallback_location: root_path
  end

  def paid_invoice
    service = InvoiceWorkflowService.new(current_user, current_company)
    result = service.pay_invoice(@invoice)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back fallback_location: root_path
  end

  def reject_invoice
    service = InvoiceWorkflowService.new(current_user, current_company)
    result = service.reject_invoice(@invoice, @contract)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back fallback_location: root_path
  end

  def show
    respond_to do |format|
      format.html
      format.pdf do
        render pdf: @invoice.contract.title,
               template: 'company/invoices/show.html.haml',
               layout: 'pdf',
               title: @invoice.contract.title,
               show_as_html: false
      end
    end
  end

  def download
    html = render_to_string(layout: false)
    pdf = WickedPdf.new.pdf_from_string(html)
    send_data(pdf, filename: "#{@contract.title}.pdf", type: 'application/pdf', disposition: 'attachment')
  end

  def authorized_user
    has_access?('manage_invoices')
  end

  def edit
    @invoice = Invoice.find(params[:id])
    # @timesheets = current_user.timesheets.approved.where.not(id: @invoice.timesheets)
    @timesheets = @invoice.contract.timesheets.approved_timesheets.where(invoice_id: nil)
  end

  def client_expense_invoice
    @invoice = Invoice.find(params[:id])
    # @client_expenses = ClientExpense.approved.joins(:contract_cycle).where.not(id: @invoice.client_expenses).where("contract_cycles.contract_id": current_company.contracts.ids, "contract_cycles.cycle_of_type": 'SellContract')
    @client_expenses = @invoice.contract.client_expenses
  end

  def update_expense_invoice
    service = InvoiceWorkflowService.new(current_user, current_company)
    result = service.update_expense_invoice(params[:id], params[:ids])
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:error] = result[:errors].first
      redirect_to invoices_path(tab: 'sent_invoices')
    end
  end

  def update
    @invoice = Invoice.find(params[:id])
    @timesheets = Timesheet.where(id: params[:ids])
    Invoice.transaction do
      @timesheets.each do |ts|
        @invoice.invoice_items.build(itemable: ts).save
      end
      @invoice.open! if @invoice.pending_invoice?
    end
    flash[:success] = 'Updated Successfully'
    redirect_to sale_invoices_path
  end

  private

  def set_invoice_timesheets(inv)
    service = InvoiceWorkflowService.new(current_user, current_company)
    service.set_invoice_timesheets(inv)
  end

  def find_contract
    # @contract = current_company.sent_contracts.find(params[:contract_id])
    @contract = Contract.find_sent_or_received(params[:contract_id], current_company).first || []
  end

  def find_invoice
    @invoice = Invoice.includes(timesheets: :transactions).find(params[:id])
    # if  !@contract.is_sent?(current_company)
    #
    # elsif  not (@invoice.submitted? && @contract.is_sent?(current_company))
    #   flash[:errors] = "Invoice is not submitted by Responde"
    #   redirect_to contract_invoices_path(@contract)
    # end
  end

  def set_invoices
    @invoices = @contract.invoices || []
  end

  def set_company_contract_invoices
    @invoices = @contract.invoices || [] if params['contract_id'].present?
    @send_contract_invoices = current_company.sent_invoices
    @rec_contract_invoices = current_company.received_invoices
  end

  def find_child_invoice_timesheet_logs(invoice)
    invoice.parent_invoice.present? ? find_child_invoice_timesheet_logs(invoice.parent_invoice) : invoice.timesheet_logs
  end
end

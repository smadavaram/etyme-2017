class Company::InvoicesController < Company::BaseController

  before_action :find_contract , only: [:show, :download , :index]
  before_action :find_invoice , only: [:show, :download]
  before_action :set_invoices , only: [:index]

  add_breadcrumb "INVOICES", '#', options: { title: "INVOICES" }

  def index
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
    @contract = current_company.sent_contracts.find(params[:contract_id])
  end

  def find_invoice
    @invoice  = @contract.invoices.includes(timesheets: [timesheet_logs: [:transactions , :contract_term]]).find(params[:id])
  end

  def set_invoices
    @invoices  = @contract.invoices || []
  end

end

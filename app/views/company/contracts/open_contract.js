if("<%= params[:status] %>" == 'accept' || "<%= params[:status] %>" == 'reject')
{
    $('#ajax-modal').html("<%= j render(partial: 'company/contracts/partials/accept_contract_modal' , locals: {contract: @contract , status: params[:status]})%>");
    $('#contract-<%= @contract.id %>').modal('show');
}
else
{
    alert("<%= params[:status] %>");

    flash_error('Error!');}
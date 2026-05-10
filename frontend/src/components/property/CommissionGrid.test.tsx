/**
 * CommissionGrid tests.
 *
 * Two modes to cover:
 *   - live: fetches from /property-commissions/grid/?property=N, edits
 *     auto-save via /property-commissions/upsert/
 *   - draft: fetches IncomeTypes from /accounting/income-types/, edits
 *     emit onDraftChange (no API mutate)
 *
 * Both cases mock propertyCommissionApi + incomeTypeApi at the module
 * boundary so the component is exercised end-to-end (render → input →
 * blur → mutation/draft callback) without touching the network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CommissionGrid } from './CommissionGrid'

// ---- mocks -----------------------------------------------------------------
vi.mock('../../services/api', () => ({
  propertyCommissionApi: {
    grid: vi.fn(),
    draftGrid: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  incomeTypeApi: {
    list: vi.fn(),
  },
}))

vi.mock('../../lib/toast', () => ({
  showToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

// Re-import so we have references to the mocks for assertions/setup.
import { propertyCommissionApi, incomeTypeApi } from '../../services/api'
const propertyCommissionApiMock = propertyCommissionApi as unknown as {
  grid: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
}
const incomeTypeApiMock = incomeTypeApi as unknown as {
  list: ReturnType<typeof vi.fn>
}

// ---- fixtures --------------------------------------------------------------
const sampleRow = (overrides: Partial<any> = {}) => ({
  income_type_id: 1,
  income_type_code: 'INC-RENT',
  income_type_name: 'Rent',
  is_commissionable: true,
  default_rate: 10,
  override_rate: null,
  effective_rate: 10,
  override_id: null,
  ...overrides,
})

function withClient(ui: React.ReactNode) {
  // Disable retries so failed mocks bail immediately and tests finish fast.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---- live mode -------------------------------------------------------------
describe('CommissionGrid — live mode', () => {
  it('renders rows fetched from the grid endpoint', async () => {
    propertyCommissionApiMock.grid.mockResolvedValue({
      data: {
        property_id: 42,
        property_name: 'Sunrise',
        rows: [
          sampleRow({ income_type_id: 1, income_type_name: 'Rent', default_rate: 10, effective_rate: 10 }),
          sampleRow({ income_type_id: 2, income_type_name: 'Maintenance', default_rate: 15, effective_rate: 15 }),
        ],
      },
    })

    render(withClient(<CommissionGrid propertyId={42} propertyName="Sunrise" />))

    expect(await screen.findByText('Rent')).toBeInTheDocument()
    expect(screen.getByText('Maintenance')).toBeInTheDocument()
    expect(propertyCommissionApiMock.grid).toHaveBeenCalledWith(42)
  })

  it('commits an edit on blur via upsert', async () => {
    propertyCommissionApiMock.grid.mockResolvedValue({
      data: { rows: [sampleRow({ income_type_id: 1, income_type_name: 'Rent' })] },
    })
    propertyCommissionApiMock.upsert.mockResolvedValue({ data: { id: 99, rate: '12' } })

    const user = userEvent.setup()
    render(withClient(<CommissionGrid propertyId={42} propertyName="Sunrise" />))

    await screen.findByText('Rent')

    // The Override input is the only number input on the row.
    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs).toHaveLength(1)

    await user.clear(inputs[0])
    await user.type(inputs[0], '12')
    // Blur the input by tabbing out — fires the auto-save commit.
    await user.tab()

    await waitFor(() => {
      expect(propertyCommissionApiMock.upsert).toHaveBeenCalledWith({
        property: 42,
        income_type: 1,
        rate: 12,
      })
    })
  })

  it('does not call upsert when value is unchanged', async () => {
    propertyCommissionApiMock.grid.mockResolvedValue({
      data: { rows: [sampleRow({ override_rate: 10 })] },
    })

    const user = userEvent.setup()
    render(withClient(<CommissionGrid propertyId={42} propertyName="Sunrise" />))

    await screen.findByText('Rent')
    const input = screen.getByRole('spinbutton')

    // Just focus + blur without changing the value.
    await user.click(input)
    await user.tab()

    expect(propertyCommissionApiMock.upsert).not.toHaveBeenCalled()
  })
})

// ---- draft mode (pre-save) -------------------------------------------------
describe('CommissionGrid — draft mode', () => {
  it('synthesizes rows from the IncomeType list', async () => {
    incomeTypeApiMock.list.mockResolvedValue({
      data: {
        results: [
          { id: 1, code: 'INC-RENT', name: 'Rent', is_commissionable: true, default_commission_rate: '10.00' },
          { id: 2, code: 'INC-LEVY', name: 'Levy', is_commissionable: false, default_commission_rate: '0.00' },
        ],
      },
    })

    render(withClient(
      <CommissionGrid mode="draft" propertyName="Draft" draft={{}} onDraftChange={vi.fn()} />,
    ))

    expect(await screen.findByText('Rent')).toBeInTheDocument()
    expect(screen.getByText('Levy')).toBeInTheDocument()
    // Critical: in draft mode we do NOT hit the property-commissions endpoint.
    expect(propertyCommissionApiMock.grid).not.toHaveBeenCalled()
  })

  it('emits onDraftChange on blur instead of calling upsert', async () => {
    incomeTypeApiMock.list.mockResolvedValue({
      data: {
        results: [
          { id: 1, code: 'INC-RENT', name: 'Rent', is_commissionable: true, default_commission_rate: '10.00' },
        ],
      },
    })
    const onDraftChange = vi.fn()
    const user = userEvent.setup()

    render(withClient(
      <CommissionGrid mode="draft" propertyName="Draft" draft={{}} onDraftChange={onDraftChange} />,
    ))

    await screen.findByText('Rent')
    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '12.5')
    await user.tab()

    await waitFor(() => {
      expect(onDraftChange).toHaveBeenCalledWith({ 1: 12.5 })
    })
    expect(propertyCommissionApiMock.upsert).not.toHaveBeenCalled()
  })

  it('removes a draft entry when the field is cleared', async () => {
    incomeTypeApiMock.list.mockResolvedValue({
      data: {
        results: [
          { id: 1, code: 'INC-RENT', name: 'Rent', is_commissionable: true, default_commission_rate: '10.00' },
        ],
      },
    })
    const onDraftChange = vi.fn()
    const user = userEvent.setup()

    render(withClient(
      <CommissionGrid mode="draft" propertyName="Draft" draft={{ 1: 12.5 }} onDraftChange={onDraftChange} />,
    ))

    await screen.findByText('Rent')
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('12.5'))

    await user.clear(input)
    await user.tab()

    await waitFor(() => {
      // Cleared value removes the draft entry rather than setting it to 0.
      expect(onDraftChange).toHaveBeenCalledWith({})
    })
  })
})
